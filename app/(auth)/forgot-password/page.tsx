'use client'

import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)
    setIsSubmitting(true)

    try {
      const supabase = createClient()
      const appUrl = process.env.NEXT_PUBLIC_APP_URL

      if (!appUrl) {
        throw new Error('NEXT_PUBLIC_APP_URL není nastaveno.')
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appUrl}/reset-password`,
      })

      if (error) {
        throw new Error(error.message)
      }

      setSuccessMessage('Odkaz pro obnovení hesla byl odeslán na váš email')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Nepodařilo se odeslat odkaz.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </Field>
        </FieldGroup>

        {successMessage ? (
          <Alert>
            <AlertTitle>Odkaz odeslán</AlertTitle>
            <AlertDescription>{successMessage}</AlertDescription>
          </Alert>
        ) : null}

        {errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Chyba</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Odesílám...' : 'Odeslat odkaz'}
        </Button>
      </form>
    </div>
  )
}