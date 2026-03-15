'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

type ResetErrors = {
  newPassword?: string
  confirmPassword?: string
}

export default function ResetPasswordPage() {
  const router = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<ResetErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): ResetErrors => {
    const nextErrors: ResetErrors = {}

    if (!newPassword) {
      nextErrors.newPassword = 'Zadejte nové heslo.'
    } else if (newPassword.length < 8) {
      nextErrors.newPassword = 'Heslo musí mít alespoň 8 znaků.'
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Potvrďte nové heslo.'
    } else if (confirmPassword !== newPassword) {
      nextErrors.confirmPassword = 'Hesla se neshodují.'
    }

    return nextErrors
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    const validationErrors = validate()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        throw new Error(error.message)
      }

      router.push('/login?message=password-reset-success')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Nepodařilo se změnit heslo.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.newPassword)}>
            <FieldLabel htmlFor="new-password">Nové heslo</FieldLabel>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(errors.newPassword)}
            />
            <FieldError>{errors.newPassword}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="confirm-password">Potvrzení nového hesla</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            <FieldError>{errors.confirmPassword}</FieldError>
          </Field>
        </FieldGroup>

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Chyba</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Ukládám...' : 'Nastavit nové heslo'}
        </Button>
      </form>
    </div>
  )
}