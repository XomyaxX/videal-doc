import Link from "next/link";
import { PIPELINE_LANES, PIPELINE_NODES, SKILL_LABEL, type PipelineLane } from "@/lib/pipeline";

type Person = { id: string; name: string; skillCodes: string[] };

export function PipelineScheme({ people }: { people: Person[] }) {
  function who(skills: string[]) {
    return people.filter((p) => p.skillCodes.some((c) => skills.includes(c)));
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">
        Это маршрут производства. Процент серии ниже считается по задачам, которые уже заведены — пустой этап
        не равен «0%», его просто нет в расчёте.
      </p>
      {PIPELINE_LANES.map((lane) => (
        <section key={lane.id}>
          <h2 className="mb-3 font-serif text-2xl text-navy">{lane.label}</h2>
          <div className="flex flex-wrap items-stretch gap-3">
            {PIPELINE_NODES.filter((n) => n.lane === lane.id).map((node, i, arr) => (
              <div key={node.code} className="flex items-stretch gap-3">
                <NodeCard node={node} people={who(node.skills)} />
                {i < arr.length - 1 ? <Arrow /> : null}
              </div>
            ))}
          </div>
          {lane.id === "preprod" ? (
            <p className="mt-2 text-sm text-muted">После режиссуры 2D уходит в сторону. После концепта — персонажи и предметы параллельно.</p>
          ) : null}
          {lane.id === "anim3d" ? (
            <p className="mt-2 text-sm text-muted">Сюда сходятся риг персонажей и дизайн локации. Без обоих 3D-анимация не стартует.</p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function NodeCard({
  node,
  people,
}: {
  node: { code: string; label: string; hint: string; skills: string[]; lane: PipelineLane };
  people: Person[];
}) {
  return (
    <div className="w-[220px] rounded-2xl border border-line bg-card p-4 shadow-[var(--shadow)]">
      <div className="font-serif text-xl text-navy">{node.label}</div>
      <div className="mt-1 text-xs font-semibold text-gold">
        {node.skills.map((s) => SKILL_LABEL[s] || s).join(" / ")}
      </div>
      <p className="mt-2 text-sm text-muted">{node.hint}</p>
      <div className="mt-3 space-y-1">
        {people.length === 0 ? (
          <p className="text-xs text-muted">Никто не отмечен — поставьте скил в карточке сотрудника.</p>
        ) : (
          people.map((p) => (
            <Link key={p.id} href={`/employees/${p.id}`} className="block text-sm font-semibold text-navy hover:text-gold">
              {p.name}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="hidden items-center text-2xl text-gold sm:flex" aria-hidden>
      →
    </div>
  );
}
