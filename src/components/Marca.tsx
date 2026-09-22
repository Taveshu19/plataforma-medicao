import { Blocks } from 'lucide-react'

export function Marca({ clara = false }: { clara?: boolean }) {
  return (
    <div className={`marca ${clara ? 'marca-clara' : ''}`}>
      <span className="marca-simbolo"><Blocks size={23} strokeWidth={1.7} aria-hidden="true" /></span>
      <span>Medição<span className="marca-sufixo">fácil</span><small>OBRAS NO RITMO CERTO</small></span>
    </div>
  )
}
