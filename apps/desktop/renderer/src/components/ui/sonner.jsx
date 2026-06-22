import { Toaster as Sonner } from 'sonner';

export function Toaster(props) {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      richColors
      toastOptions={{
        classNames: {
          toast: 'group toast group-[.toaster]:bg-card group-[.toaster]:text-card-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
        },
      }}
      {...props}
    />
  );
}
