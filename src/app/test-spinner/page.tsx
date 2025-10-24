import { Spinner } from '@/app/components/ui/spinners/spinner-ring-circle';

export default function TestSpinnerPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-8">
      <h1 className="text-2xl font-bold">Spinner Test</h1>

      <div className="flex flex-col gap-8">
        <div className="flex flex-col items-center gap-4">
          <h2 className="text-lg">Small - Default</h2>
          <div className="flex h-24 w-24 items-center justify-center bg-slate-100">
            <Spinner size="sm" variant="default" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <h2 className="text-lg">Medium - Primary</h2>
          <div className="flex h-24 w-24 items-center justify-center bg-slate-100">
            <Spinner size="md" variant="primary" />
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <h2 className="text-lg">Large - Accent</h2>
          <div className="flex h-32 w-32 items-center justify-center bg-slate-100">
            <Spinner size="lg" variant="accent" />
          </div>
        </div>
      </div>
    </div>
  );
}
