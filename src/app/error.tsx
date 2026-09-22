'use client'
import Link from 'next/link'
import { CircleAlert } from 'lucide-react'
import { Button, Card } from '@/components/ui'

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <Card>
        <CircleAlert className="mb-6 text-amber-700" size={32} aria-hidden="true" />
        <h1 className="text-2xl font-bold">Não foi possível carregar.</h1>
        <p className="my-4 text-slate-600">Verifique sua conexão e tente novamente. Se continuar, fale com a equipe da obra.</p>
        <Button onClick={() => retry()} className="w-full">Tentar novamente</Button>
        <Link href="/" className="mt-5 block text-center text-sm underline">Voltar para o início</Link>
      </Card>
    </main>
  )
}
