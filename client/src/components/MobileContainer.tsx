interface MobileContainerProps {
  children: React.ReactNode;
  className?: string;
}

export default function MobileContainer({ children, className = "" }: MobileContainerProps) {
  return (
    <div
      className={`w-full max-w-2xl mx-auto px-3 py-4 text-base ${className}`}
      data-testid="container-mobile"
    >
      {children}
    </div>
  );
}
