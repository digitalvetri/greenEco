import { PageHeader } from "./stat";
import { Card, CardContent } from "./card";

export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={`Scheduled for ${phase}`} />
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted">
          This module is part of <strong>{phase}</strong> and is being built.
        </CardContent>
      </Card>
    </div>
  );
}
