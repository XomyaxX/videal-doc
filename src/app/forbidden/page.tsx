import { Button, Card } from "@/components/ui";

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <Card className="max-w-md text-center">
        <h1 className="font-serif text-2xl text-navy">Нет доступа</h1>
        <p className="mt-2 text-muted">Этот раздел вам не назначен. Попросите администратора изменить уровень доступа.</p>
        <Button href="/" className="mt-5">
          На главную
        </Button>
      </Card>
    </div>
  );
}
