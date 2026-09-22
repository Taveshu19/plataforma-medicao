import Link from 'next/link'
import { Card } from '@/components/ui'

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-16">
      <Card>
        <p className="section-eyebrow mb-4">Página não encontrada</p>
        <h1 className="text-2xl font-bold">Vamos voltar à obra.</h1>
        <p className="my-4 text-slate-600">Este endereço não está disponível. Acesse o início para continuar.</p>
        <Link href="/" className="ui-button ui-button-primary w-full">Voltar para o início</Link>
      </Card>
    </main>
  )
}
