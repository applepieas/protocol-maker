'use client'

import Link from 'next/link'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

type RegisterErrors = {
  displayName?: string
  email?: string
  password?: string
  confirmPassword?: string
}

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const validate = (): RegisterErrors => {
    const nextErrors: RegisterErrors = {}

    if (!displayName.trim()) {
      nextErrors.displayName = 'Zadejte jméno.'
    }

    if (!email.trim()) {
      nextErrors.email = 'Zadejte email.'
    }

    if (!password) {
      nextErrors.password = 'Zadejte heslo.'
    } else if (password.length < 8) {
      nextErrors.password = 'Heslo musí mít alespoň 8 znaků.'
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Potvrďte heslo.'
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Hesla se neshodují.'
    }

    return nextErrors
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const validationErrors = validate()
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            display_name: displayName,
          },
        },
      })

      if (error) {
        throw new Error(error.message)
      }

      setSuccessMessage('Zkontrolujte svůj email a potvrďte registraci')
      setDisplayName('')
      setEmail('')
      setPassword('')
      setConfirmPassword('')
      setErrors({})
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Registrace selhala.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <FieldGroup>
          <Field data-invalid={Boolean(errors.displayName)}>
            <FieldLabel htmlFor="display-name">Jméno</FieldLabel>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-invalid={Boolean(errors.displayName)}
            />
            <FieldError>{errors.displayName}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={Boolean(errors.email)}
            />
            <FieldError>{errors.email}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.password)}>
            <FieldLabel htmlFor="password">Heslo</FieldLabel>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={Boolean(errors.password)}
            />
            <FieldError>{errors.password}</FieldError>
          </Field>

          <Field data-invalid={Boolean(errors.confirmPassword)}>
            <FieldLabel htmlFor="confirm-password">Potvrzení hesla</FieldLabel>
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

        {successMessage ? (
          <Alert>
            <AlertTitle>Registrace odeslána</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Chyba registrace</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Vytvářím účet...' : 'Vytvořit účet'}
        </Button>
      </form>

      <p className="text-sm">
        Již máte účet?{' '}
        <Link className="underline underline-offset-4" href="/login">
          Přihlaste se
        </Link>
      </p>
    </div>
  )
}