/*
 * Copyright Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Spinner } from '@/components/ui/spinner'
import { useCloneSnapshotMutation } from '@/hooks/mutations/useCloneSnapshotMutation'
import { useSelectedOrganization } from '@/hooks/useSelectedOrganization'
import { handleApiError } from '@/lib/error-handling'
import { snapshotNameSchema } from '@/lib/schema'
import { cn } from '@/lib/utils'
import type { SnapshotDto } from '@cogbox/api-client'
import { useForm } from '@tanstack/react-form'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

const buildCloneFormSchema = (sourceDisk: number) =>
  z.object({
    name: snapshotNameSchema,
    cpu: z.number().min(1).optional(),
    memory: z.number().min(1).optional(),
    disk: z
      .number()
      .min(1)
      .optional()
      .refine(
        (disk) => disk === undefined || disk >= sourceDisk,
        `Disk size cannot be smaller than the source snapshot (${sourceDisk} GiB)`,
      ),
  })

type FormValues = z.infer<ReturnType<typeof buildCloneFormSchema>>

export interface CloneSnapshotSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  snapshot: SnapshotDto | null
  onSnapshotCloned?: (snapshot: SnapshotDto) => void
  className?: string
}

export function CloneSnapshotSheet({
  open,
  onOpenChange,
  snapshot,
  onSnapshotCloned,
  className,
}: CloneSnapshotSheetProps) {
  const { selectedOrganization } = useSelectedOrganization()
  const { reset: resetCloneSnapshotMutation, ...cloneSnapshotMutation } = useCloneSnapshotMutation()
  const formRef = useRef<HTMLFormElement>(null)

  const formSchema = useMemo(() => buildCloneFormSchema(snapshot?.disk ?? 1), [snapshot?.disk])

  const formDefaultValues = useMemo<FormValues>(
    () => ({
      name: snapshot ? `${snapshot.name}-clone` : '',
      cpu: undefined,
      memory: undefined,
      disk: undefined,
    }),
    [snapshot],
  )

  const form = useForm({
    defaultValues: formDefaultValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmitInvalid: () => {
      const formElement = formRef.current
      if (!formElement) return
      const invalidInput = formElement.querySelector('[aria-invalid="true"]') as HTMLInputElement | null
      if (invalidInput) {
        invalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' })
        invalidInput.focus()
      }
    },
    onSubmit: async ({ value }) => {
      if (!snapshot) return

      if (!selectedOrganization?.id) {
        toast.error('Select an organization to clone a snapshot.')
        return
      }

      try {
        const clonedSnapshot = await cloneSnapshotMutation.mutateAsync({
          snapshotId: snapshot.id,
          clone: {
            name: value.name.trim(),
            cpu: value.cpu,
            memory: value.memory,
            disk: value.disk,
          },
          organizationId: selectedOrganization.id,
        })

        toast.success(`Cloning snapshot ${value.name.trim()}`)
        onSnapshotCloned?.(clonedSnapshot)
        onOpenChange(false)
      } catch (error) {
        handleApiError(error, 'Failed to clone snapshot')
      }
    },
  })

  const { reset: resetForm } = form

  useEffect(() => {
    if (open) {
      resetForm(formDefaultValues)
      resetCloneSnapshotMutation()
    }
  }, [open, resetForm, formDefaultValues, resetCloneSnapshotMutation])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn('w-dvw sm:w-[500px] p-0 flex flex-col gap-0', className)}>
        <SheetHeader className="border-b border-border p-4 px-5 items-center flex text-left flex-row">
          <SheetTitle>Clone Snapshot</SheetTitle>
          <SheetDescription className="sr-only">
            Create a copy of an existing snapshot with a new name and optional resource overrides.
          </SheetDescription>
        </SheetHeader>
        <ScrollArea fade="mask" className="flex-1 min-h-0">
          <form
            ref={formRef}
            id="clone-snapshot-form"
            className="gap-6 flex flex-col p-5"
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              form.handleSubmit()
            }}
          >
            {snapshot && (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <span className="text-muted-foreground">Source snapshot: </span>
                <span className="font-medium break-all">{snapshot.name}</span>
              </div>
            )}

            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Snapshot Name</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder={snapshot ? `${snapshot.name}-clone` : 'my-snapshot-clone'}
                    />
                    <FieldDescription>
                      The name you will use in your client app (SDK, CLI) to reference the cloned snapshot.
                    </FieldDescription>
                    {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>

            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Resources</Label>
              <div className="flex flex-col gap-2">
                <form.Field name="cpu">
                  {(field) => (
                    <div className="flex items-center gap-4">
                      <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                        Compute (vCPU):
                      </Label>
                      <Input
                        id={field.name}
                        type="number"
                        className="w-full"
                        min="1"
                        placeholder={snapshot?.cpu?.toString() ?? '1'}
                        value={field.state.value ?? ''}
                        onChange={(e) => field.handleChange(parseInt(e.target.value) || undefined)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="memory">
                  {(field) => (
                    <div className="flex items-center gap-4">
                      <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                        Memory (GiB):
                      </Label>
                      <Input
                        id={field.name}
                        type="number"
                        className="w-full"
                        min="1"
                        placeholder={snapshot?.mem?.toString() ?? '1'}
                        value={field.state.value ?? ''}
                        onChange={(e) => field.handleChange(parseInt(e.target.value) || undefined)}
                      />
                    </div>
                  )}
                </form.Field>
                <form.Field name="disk">
                  {(field) => {
                    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
                    return (
                      <Field data-invalid={isInvalid}>
                        <div className="flex items-center gap-4">
                          <Label htmlFor={field.name} className="w-32 flex-shrink-0">
                            Storage (GiB):
                          </Label>
                          <Input
                            aria-invalid={isInvalid}
                            id={field.name}
                            type="number"
                            className="w-full"
                            min={snapshot?.disk ?? 1}
                            placeholder={snapshot?.disk?.toString() ?? '3'}
                            value={field.state.value ?? ''}
                            onChange={(e) => field.handleChange(parseInt(e.target.value) || undefined)}
                          />
                        </div>
                        {field.state.meta.errors.length > 0 && field.state.meta.isTouched && (
                          <FieldError errors={field.state.meta.errors} />
                        )}
                      </Field>
                    )
                  }}
                </form.Field>
              </div>
              <FieldDescription>
                If not specified, the source snapshot values will be used
                {snapshot ? ` (${snapshot.cpu} vCPU, ${snapshot.mem} GiB memory, ${snapshot.disk} GiB storage)` : ''}.
                Disk size cannot be smaller than the source snapshot.
              </FieldDescription>
            </div>
          </form>
        </ScrollArea>
        <SheetFooter className="border-t border-border p-4 px-5">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
            children={([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form="clone-snapshot-form"
                variant="default"
                disabled={!canSubmit || isSubmitting || !snapshot}
              >
                {isSubmitting && <Spinner />}
                Clone
              </Button>
            )}
          />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
