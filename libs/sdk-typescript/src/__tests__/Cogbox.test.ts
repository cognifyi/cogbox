// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

import { createApiResponse } from './helpers'

const mockAxiosCreate = jest.fn()
const mockSandboxApi = {
  createSandbox: jest.fn(),
  getSandbox: jest.fn(),
  listSandboxes: jest.fn(),
  getBuildLogsUrl: jest.fn(),
}
const mockSnapshotsApi = {}
const mockObjectStorageApi = {}
const mockConfigApi = {}
const mockVolumesApi = {}

const mockSnapshotServiceCtor = jest.fn()
const mockVolumeServiceCtor = jest.fn()
const mockSandboxCtor = jest.fn()
const mockProcessImageContext = jest.fn()
const mockProcessStreamingResponse = jest.fn()
const mockConfigurationCtor = jest.fn().mockImplementation((args: Record<string, unknown>) => ({
  ...args,
  baseOptions: (args.baseOptions as Record<string, unknown>) ?? { headers: {} },
}))

jest.mock('axios', () => {
  class MockAxiosError extends Error {}
  return {
    __esModule: true,
    default: {
      create: mockAxiosCreate,
      AxiosError: MockAxiosError,
    },
    create: mockAxiosCreate,
    AxiosError: MockAxiosError,
  }
})

jest.mock(
  '@cogbox/api-client',
  () => ({
    __esModule: true,
    Configuration: mockConfigurationCtor,
    SandboxApi: jest.fn(() => mockSandboxApi),
    SnapshotsApi: jest.fn(() => mockSnapshotsApi),
    ObjectStorageApi: jest.fn(() => mockObjectStorageApi),
    ConfigApi: jest.fn(() => mockConfigApi),
    VolumesApi: jest.fn(() => mockVolumesApi),
    SandboxState: {
      PENDING_BUILD: 'pending_build',
      STARTED: 'started',
      STARTING: 'starting',
      ERROR: 'error',
      BUILD_FAILED: 'build_failed',
    },
  }),
  { virtual: true },
)

// Constructor-time auth/url resolution must be deterministic in tests, so
// short-circuit CogboxEnvReader to read process.env only — never the
// developer's .env / .env.local files.
jest.mock('../utils/Runtime', () => {
  const actual = jest.requireActual('../utils/Runtime')
  class TestEnvReader {
    get(name: string): string | undefined {
      if (!name.startsWith('COGBOX_')) {
        throw new Error(`CogboxEnvReader: variable name must start with 'COGBOX_', got '${name}'`)
      }
      return process.env[name]
    }
  }
  return { ...actual, CogboxEnvReader: TestEnvReader }
})

jest.mock('../Snapshot', () => {
  const SnapshotService = jest.fn().mockImplementation((...args: unknown[]) => {
    mockSnapshotServiceCtor(...args)
    return { list: jest.fn() }
  })
  Object.assign(SnapshotService, {
    processImageContext: (...args: unknown[]) => mockProcessImageContext(...args),
  })
  return { SnapshotService }
})

jest.mock('../utils/Stream', () => ({
  processStreamingResponse: (...args: unknown[]) => mockProcessStreamingResponse(...args),
}))

jest.mock('../Volume', () => ({
  VolumeService: jest.fn().mockImplementation((...args: unknown[]) => {
    mockVolumeServiceCtor(...args)
    return { list: jest.fn() }
  }),
}))

jest.mock('../Sandbox', () => ({
  Sandbox: jest.fn().mockImplementation((dto: { id: string; state?: string }, ...rest: unknown[]) => {
    const sandbox = {
      ...dto,
      start: jest.fn(),
      stop: jest.fn(),
      delete: jest.fn(),
      waitUntilStarted: jest.fn(),
      _experimental_fork: jest.fn(),
    }
    mockSandboxCtor(dto, ...rest)
    return sandbox
  }),
}))

describe('Cogbox', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()

    delete process.env.COGBOX_API_KEY
    delete process.env.COGBOX_JWT_TOKEN
    delete process.env.COGBOX_ORGANIZATION_ID
    delete process.env.COGBOX_API_URL
    delete process.env.COGBOX_SERVER_URL
    delete process.env.COGBOX_TARGET

    mockAxiosCreate.mockReturnValue({
      defaults: { baseURL: 'http://sandbox-proxy/' },
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    })
  })

  it('uses explicit api key config and builds dependent services', async () => {
    const { Cogbox } = await import('../Cogbox')

    const instance = new Cogbox({
      apiKey: 'api-key',
      apiUrl: 'https://example.cogbox.test/api',
      target: 'eu',
    })

    expect(instance).toBeTruthy()
    expect(mockConfigurationCtor).toHaveBeenCalled()
    expect(mockVolumeServiceCtor).toHaveBeenCalledTimes(1)
    expect(mockSnapshotServiceCtor).toHaveBeenCalledTimes(1)
  })

  it('reads constructor values from env when config omitted', async () => {
    process.env.COGBOX_API_KEY = 'env-key'
    process.env.COGBOX_API_URL = 'https://env.cogbox/api'
    process.env.COGBOX_TARGET = 'us'

    const { Cogbox } = await import('../Cogbox')

    new Cogbox()

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      basePath: string
      baseOptions: { headers: Record<string, string> }
    }

    expect(firstConfigArg.basePath).toBe('https://env.cogbox/api')
    expect(firstConfigArg.baseOptions.headers.Authorization).toBe('Bearer env-key')
  })

  it('falls back to the default api url when none is provided', async () => {
    process.env.COGBOX_API_KEY = 'env-key'
    process.env.COGBOX_TARGET = 'us'

    const { Cogbox } = await import('../Cogbox')

    new Cogbox()

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      basePath: string
    }

    expect(firstConfigArg.basePath).toBe('https://cogbox.pazity.com/api')
  })

  it('supports deprecated serverUrl config', async () => {
    const { Cogbox } = await import('../Cogbox')

    new Cogbox({ apiKey: 'k', serverUrl: 'https://legacy.cogbox/api', target: 'us' })

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      basePath: string
    }

    expect(firstConfigArg.basePath).toBe('https://legacy.cogbox/api')
  })

  it('reads deprecated server url from env and warns once', async () => {
    process.env.COGBOX_API_KEY = 'env-key'
    process.env.COGBOX_SERVER_URL = 'https://server.cogbox/api'
    process.env.COGBOX_TARGET = 'us'
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { Cogbox } = await import('../Cogbox')

    new Cogbox()

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      basePath: string
    }

    expect(firstConfigArg.basePath).toBe('https://server.cogbox/api')
    expect(warnSpy).toHaveBeenCalledTimes(1)

    warnSpy.mockRestore()
  })

  it('supports jwt auth with organization header', async () => {
    const { Cogbox } = await import('../Cogbox')

    new Cogbox({
      jwtToken: 'jwt-token',
      organizationId: 'org-1',
      apiUrl: 'https://jwt.cogbox/api',
      target: 'us',
    })

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      baseOptions: { headers: Record<string, string> }
    }
    expect(firstConfigArg.baseOptions.headers.Authorization).toBe('Bearer jwt-token')
    expect(firstConfigArg.baseOptions.headers['X-Cogbox-Organization-ID']).toBe('org-1')
  })

  it('throws when no credentials are provided', async () => {
    const { Cogbox } = await import('../Cogbox')
    delete process.env.COGBOX_API_KEY
    delete process.env.COGBOX_JWT_TOKEN
    delete process.env.COGBOX_ORGANIZATION_ID
    expect(() => new Cogbox()).toThrow('Authentication credentials not found.')
  })

  it('throws when jwt auth has no organization id', async () => {
    const { Cogbox } = await import('../Cogbox')
    delete process.env.COGBOX_ORGANIZATION_ID
    expect(
      () =>
        new Cogbox({
          jwtToken: 'jwt-token',
          apiUrl: 'https://jwt.cogbox/api',
          target: 'us',
        }),
    ).toThrow('COGBOX_ORGANIZATION_ID is required when authenticating with COGBOX_JWT_TOKEN.')
  })

  it('reads jwt credentials from env when config omits them', async () => {
    process.env.COGBOX_JWT_TOKEN = 'env-jwt'
    process.env.COGBOX_ORGANIZATION_ID = 'env-org'
    process.env.COGBOX_API_URL = 'https://env-jwt.cogbox/api'
    process.env.COGBOX_TARGET = 'eu'

    const { Cogbox } = await import('../Cogbox')

    new Cogbox()

    const firstConfigArg = mockConfigurationCtor.mock.calls[0][0] as {
      baseOptions: { headers: Record<string, string> }
    }

    expect(firstConfigArg.baseOptions.headers.Authorization).toBe('Bearer env-jwt')
    expect(firstConfigArg.baseOptions.headers['X-Cogbox-Organization-ID']).toBe('env-org')
  })

  it('throws unsupported language in create', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    await expect(instance.create({ language: 'rust' })).rejects.toThrow('Invalid code-toolbox-language: rust')
  })

  test.each<
    [{ timeout?: number }, string, { language?: string; autoStopInterval?: number; autoArchiveInterval?: number }]
  >([
    [{ timeout: -1 }, 'Timeout must be a non-negative number', { language: 'python' }],
    [{}, 'autoStopInterval must be a non-negative integer', { autoStopInterval: -1 }],
    [{}, 'autoArchiveInterval must be a non-negative integer', { autoArchiveInterval: -1 }],
  ])('validates create input %#', async (optionsPart, message, params) => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    await expect(instance.create(params, optionsPart)).rejects.toThrow(message)
  })

  it('forces autoDeleteInterval to 0 for ephemeral sandboxes', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-1', state: 'started', labels: { 'code-toolbox-language': 'python' } }),
    )

    await instance.create({ language: 'python', ephemeral: true, autoDeleteInterval: 12 })

    const payload = mockSandboxApi.createSandbox.mock.calls[0][0] as { autoDeleteInterval?: number }
    expect(payload.autoDeleteInterval).toBe(0)
  })

  it('defaults create params and timeout when omitted', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-default', state: 'started', labels: { 'code-toolbox-language': 'python' } }),
    )

    await instance.create()

    expect(mockSandboxApi.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        labels: { 'code-toolbox-language': 'python' },
        target: 'us',
      }),
      undefined,
      { timeout: 60000 },
    )
  })

  it('creates sandboxes from image names using buildInfo dockerfile content', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-image', state: 'started', labels: { 'code-toolbox-language': 'python' } }),
    )

    await instance.create({ image: 'node:20', language: 'typescript', envVars: { NODE_ENV: 'test' } })

    expect(mockSandboxApi.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        buildInfo: { dockerfileContent: 'FROM node:20\n' },
        env: { NODE_ENV: 'test' },
        labels: { 'code-toolbox-language': 'typescript' },
      }),
      undefined,
      { timeout: 60000 },
    )
  })

  it('creates sandboxes from declarative images using image context hashes', async () => {
    const { Cogbox } = await import('../Cogbox')
    const { Image } = await import('../Image')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockProcessImageContext.mockResolvedValue(['ctx-hash'])
    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-image', state: 'started', labels: { 'code-toolbox-language': 'python' } }),
    )

    const image = Image.base('python:3.12').runCommands('echo hi')
    await instance.create({ image, resources: { cpu: 2, memory: 4 } })

    expect(mockProcessImageContext).toHaveBeenCalledWith(mockObjectStorageApi, image)
    expect(mockSandboxApi.createSandbox).toHaveBeenCalledWith(
      expect.objectContaining({
        buildInfo: expect.objectContaining({
          contextHashes: ['ctx-hash'],
          dockerfileContent: expect.stringContaining('RUN echo hi'),
        }),
        cpu: 2,
        memory: 4,
      }),
      undefined,
      { timeout: 60000 },
    )
  })

  it('waits for non-started sandboxes returned by create', async () => {
    const { Cogbox } = await import('../Cogbox')
    const { Sandbox } = await import('../Sandbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-wait', state: 'starting', labels: { 'code-toolbox-language': 'python' } }),
    )

    await instance.create({ language: 'python' }, { timeout: 9 })

    const sandboxResults = (Sandbox as jest.Mock).mock.results
    const createdSandbox = sandboxResults[sandboxResults.length - 1].value as { waitUntilStarted: jest.Mock }
    expect(createdSandbox.waitUntilStarted).toHaveBeenCalled()
  })

  it('wraps CogboxTimeoutError from sandbox startup in create', async () => {
    const { Cogbox } = await import('../Cogbox')
    const { Sandbox } = await import('../Sandbox')
    const { CogboxTimeoutError } = await import('../errors/CogboxError')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.createSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-timeout', state: 'starting', labels: { 'code-toolbox-language': 'python' } }),
    )
    ;(Sandbox as jest.Mock).mockImplementationOnce((dto: { id: string; state?: string }) => ({
      ...dto,
      start: jest.fn(),
      stop: jest.fn(),
      delete: jest.fn(),
      waitUntilStarted: jest.fn().mockRejectedValue(new CogboxTimeoutError('slow start')),
      _experimental_fork: jest.fn(),
    }))

    await expect(instance.create({ language: 'python' }, { timeout: 7 })).rejects.toThrow(
      'Failed to create and start sandbox within 7 seconds. Operation timed out.',
    )
  })

  it('gives each listed sandbox its own Configuration instance', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.listSandboxes.mockResolvedValue(
      createApiResponse({
        items: [
          { id: 'sb-1', labels: {} },
          { id: 'sb-2', labels: {} },
          { id: 'sb-3', labels: {} },
        ],
        nextCursor: null,
      }),
    )

    for await (const _ of instance.list()) {
      void _
    }

    expect(mockSandboxCtor).toHaveBeenCalledTimes(3)
    const configs = mockSandboxCtor.mock.calls.map((call: unknown[]) => call[1])
    expect(new Set(configs).size).toBe(3)
  })

  it('serializes label filters when listing sandboxes', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.listSandboxes.mockResolvedValue(createApiResponse({ items: [], nextCursor: null }))

    const iter = instance.list({ labels: { team: 'sdk', env: 'test' }, limit: 5 })
    // Drive the generator to trigger the API call.
    for await (const _ of iter) {
      // no-op
    }

    expect(mockSandboxApi.listSandboxes).toHaveBeenCalledTimes(1)
    const call = mockSandboxApi.listSandboxes.mock.calls[0]
    // Positional args: (orgHeader, cursor, limit, id, name, labelsJson, ...)
    expect(call[1]).toBeUndefined() // cursor on first call
    expect(call[2]).toBe(5) // limit
    expect(call[5]).toBe('{"team":"sdk","env":"test"}') // labels JSON
  })

  it('delegates experimental fork to the sandbox instance', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    const sandbox = {
      _experimental_fork: jest.fn().mockResolvedValue({ id: 'forked' }),
    }

    await expect(instance._experimental_fork(sandbox as never, { name: 'forked' }, 12)).resolves.toEqual({
      id: 'forked',
    })
    expect(sandbox._experimental_fork).toHaveBeenCalledWith({ name: 'forked' }, 12)
  })

  it('delegates get/list/start/stop/delete methods', async () => {
    const { Cogbox } = await import('../Cogbox')
    const instance = new Cogbox({ apiKey: 'k', apiUrl: 'http://api', target: 'us' })

    mockSandboxApi.getSandbox.mockResolvedValue(
      createApiResponse({ id: 'sb-1', labels: { 'code-toolbox-language': 'python' } }),
    )
    mockSandboxApi.listSandboxes.mockResolvedValue(
      createApiResponse({
        items: [{ id: 'sb-1', labels: { 'code-toolbox-language': 'python' } }],
        nextCursor: null,
      }),
    )

    const sandboxFromGet = (await instance.get('sb-1')) as unknown as {
      id: string
      start: jest.Mock
      stop: jest.Mock
      delete: jest.Mock
    }
    expect(mockSandboxApi.getSandbox).toHaveBeenCalledWith('sb-1')

    const collected: unknown[] = []
    for await (const sb of instance.list({ labels: { project: 'sdk' }, limit: 10 })) {
      collected.push(sb)
    }
    expect(mockSandboxApi.listSandboxes).toHaveBeenCalled()
    expect(collected).toHaveLength(1)

    await instance.start(sandboxFromGet as unknown as never)
    await instance.stop(sandboxFromGet as unknown as never)
    await instance.delete(sandboxFromGet as unknown as never, 33)

    expect(sandboxFromGet.start).toHaveBeenCalled()
    expect(sandboxFromGet.stop).toHaveBeenCalled()
    expect(sandboxFromGet.delete).toHaveBeenCalledWith(33)
  })
})
