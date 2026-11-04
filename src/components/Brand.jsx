export default function Brand({ subtitle, size = 'md' }) {
  return (
    <div className="text-center">
      <h1
        className={`font-serif font-semibold tracking-[0.18em] text-gold ${
          size === 'lg' ? 'text-3xl' : 'text-2xl'
        }`}
      >
        THE_HALAL_WAY_26
      </h1>
      {subtitle && <p className="mt-1 text-sm text-beige/80">{subtitle}</p>}
    </div>
  )
}
