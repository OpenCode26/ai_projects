"use client";

type AddCardFormProps = {
  onAdd: (title: string, details: string) => void;
};

export function AddCardForm({ onAdd }: AddCardFormProps) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value.trim();
    const details = (form.elements.namedItem("details") as HTMLTextAreaElement).value.trim();
    if (!title) return;
    onAdd(title, details);
    form.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <input
        name="title"
        placeholder="Card title"
        required
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <textarea
        name="details"
        placeholder="Details (optional)"
        rows={2}
        className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-navy placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <button
        type="submit"
        className="w-full rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-white transition hover:bg-secondary/90"
      >
        Add card
      </button>
    </form>
  );
}
