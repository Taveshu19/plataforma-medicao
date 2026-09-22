import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`ui-card ${className}`} {...props} />
}

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  return <button className={`ui-button ui-button-${variant} ${className}`} {...props} />
}

export function ActionLink({ href, icon: Icon, children, primary = false }: { href: string; icon: LucideIcon; children: ReactNode; primary?: boolean }) {
  return (
    <Link href={href} className={`action-link ${primary ? 'action-link-primary' : ''}`}>
      <Icon size={22} aria-hidden="true" /><span>{children}</span><ArrowUpRight size={20} aria-hidden="true" />
    </Link>
  )
}

export function StepHeader({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="step-header" aria-label="Etapas da medição">
      {['Local', 'Serviços', 'Revisão'].map((label, i) => (
        <li key={label} aria-current={current === i + 1 ? 'step' : undefined} className={current >= i + 1 ? 'step-active' : ''}>
          <span>{String(i + 1).padStart(2, '0')}</span>{label}
        </li>
      ))}
    </ol>
  )
}

export function Badge({ className = '', ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`ui-badge ${className}`} {...props} />
}
