import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ring-offset-white',
  {
    variants: {
      variant: {
        default:
          'bg-slate-950 text-white shadow-[0_16px_40px_-20px_rgba(15,23,42,0.7)] hover:bg-slate-800',
        outline:
          'border border-slate-300 bg-white text-slate-950 hover:border-slate-400 hover:bg-slate-50',
        secondary:
          'bg-orange-100 text-orange-950 hover:bg-orange-200',
        ghost: 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 rounded-xl px-3.5 text-xs',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)
