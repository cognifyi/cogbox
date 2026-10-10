import { Cogbox } from '@cogbox/sdk'
import path from 'path'

async function main() {
  const cogbox = new Cogbox()

  //  Create a new volume or get an existing one
  const volume = await cogbox.volume.get('my-volume', true)

  // Mount the volume to the sandbox
  const mountDir1 = '/home/cogbox/volume'

  const sandbox1 = await cogbox.create({
    language: 'typescript',
    volumes: [{ volumeId: volume.id, mountPath: mountDir1 }],
  })

  // Create a new directory in the mount directory
  const newDir = path.join(mountDir1, 'new-dir')
  await sandbox1.fs.createFolder(newDir, '755')

  // Create a new file in the mount directory
  const newFile = path.join(mountDir1, 'new-file.txt')
  await sandbox1.fs.uploadFile(Buffer.from('Hello, World!'), newFile)

  // Create a new sandbox with the same volume
  // and mount it to the different path
  const mountDir2 = '/home/cogbox/my-files'

  const sandbox2 = await cogbox.create({
    language: 'typescript',
    volumes: [{ volumeId: volume.id, mountPath: mountDir2 }],
  })

  // List files in the mount directory
  const files = await sandbox2.fs.listFiles(mountDir2)
  console.log('Files:', files)

  // Get the file from the first sandbox
  const file = await sandbox1.fs.downloadFile(newFile)
  console.log('File:', file.toString())

  // Mount a specific subpath within the volume
  // This is useful for isolating data or implementing multi-tenancy
  const mountDir3 = '/home/cogbox/subpath'

  const sandbox3 = await cogbox.create({
    language: 'typescript',
    volumes: [{ volumeId: volume.id, mountPath: mountDir3, subpath: 'users/alice' }],
  })

  // This sandbox will only see files within the 'users/alice' subpath
  // Create a file in the subpath
  const subpathFile = path.join(mountDir3, 'alice-file.txt')
  await sandbox3.fs.uploadFile(Buffer.from("Hello from Alice's subpath!"), subpathFile)

  // The file is stored at: volume-root/users/alice/alice-file.txt
  // but appears at: /home/cogbox/subpath/alice-file.txt in the sandbox

  // Cleanup
  await cogbox.delete(sandbox1)
  await cogbox.delete(sandbox2)
  await cogbox.delete(sandbox3)
  // await cogbox.volume.delete(volume)
}

main()
