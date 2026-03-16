const sizes = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-4',
  lg: 'w-10 h-10 border-4',
};

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <div
      className={`${sizes[size] || sizes.md} border-brand-200 border-t-brand-500 rounded-full animate-spin ${className}`}
    />
  );
}
