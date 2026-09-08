"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { STAGE_LABEL } from "@/lib/prod";
import { LibraryPicker } from "@/components/LibraryPicker";
import { SKILL_LABEL } from "@/lib/pipeline";
import { skillsForKindStage } from "@/lib/prod-kinds";
import { templatesForPipeline, type TaskTemplate } from "@/lib/task-templates";

type Scene = { id: string; code: string; title: string; shots: { id: string; code: string }[] };
type Asset = { id: string; name: string; kind: string };
type Person = { id: string; name: string; skillCodes: string[] };

export function NewTaskForm({
  scenes,
  assets,
  people,
  pipelineKind,
  episodeId,
}: {
  scenes: Scene[];
  assets: Asset[];
  people: Person[];
  pipelineKind: string | null;
  episodeId: string | null;
}) {
  const router = useRouter();
  const templates = useMemo(() => templatesForPipeline(pipelineKind), [pipelineKind]);
  const [templateId, setTemplateId] = useState(templates.find((t) => t.group === "pipeline")?.id || templates[0]?.id || "free");
  const template: TaskTemplate = templates.find((t) => t.id === templateId) || templates[0];
  const kind = template?.kind || "job";

  const [title, setTitle] = useState("");
  const [sceneId, setSceneId] = useState(scenes[0]?.id || "");
  const [shotId, setShotId] = useState("");
  const [newShot, setNewShot] = useState("");
  const [assetId, setAssetId] = useState(assets[0]?.id || "");
  const [newAsset, setNewAsset] = useState("");
  const [assetKind, setAssetKind] = useState("prop");
  const [stage, setStage] = useState(template?.defaultStage || "task");
  const [assigneeId, setAssigneeId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [libraryIds, setLibraryIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shots = useMemo(() => scenes.find((s) => s.id === sceneId)?.shots || [], [scenes, sceneId]);
  const selectedAssetKind = newAsset ? assetKind : assets.find((a) => a.id === assetId)?.kind;
  const needSkills =
    template?.skillCodes.length
      ? template.skillCodes
      : skillsForKindStage(pipelineKind, stage, kind === "asset" ? selectedAssetKind : undefined);
  const skilledPeople = people.filter(
    (p) => needSkills.length === 0 || needSkills.some((s) => p.skillCodes.includes(s)),
  );
  const assigneeList = skilledPeople.length > 0 ? skilledPeople : people;
  const stages = template?.stages?.length ? template.stages : [stage];
  const groups = useMemo(() => {
    const map = new Map<string, TaskTemplate[]>();
    for (const t of templates) {
      const list = map.get(t.groupLabel) || [];
      list.push(t);
      map.set(t.groupLabel, list);
    }
    return [...map.entries()];
  }, [templates]);

  function pickTemplate(id: string) {
    const next = templates.find((t) => t.id === id);
    setTemplateId(id);
    if (next) setStage(next.defaultStage);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/prod/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        stage,
        title: kind === "job" ? title : undefined,
        episodeId: episodeId || undefined,
        sceneId: kind === "asset" || kind === "episode" || kind === "job" ? undefined : sceneId,
        shotId: kind === "shot" && !newShot ? shotId : undefined,
        newShotCode: kind === "shot" ? newShot : undefined,
        assetId: kind === "asset" && !newAsset ? assetId : undefined,
        newAssetName: kind === "asset" ? newAsset : undefined,
        newAssetKind: kind === "asset" ? assetKind : undefined,
        skillCodes: template?.skillCodes || [],
        assigneeId,
        startsAt,
        dueAt,
        comment,
        libraryIds,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Не удалось создать");
    else router.push(`/prod/tasks/${data.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <Field label="Шаблон">
        <Select value={templateId} onChange={(e) => pickTemplate(e.target.value)}>
          {groups.map(([label, rows]) => (
            <optgroup key={label} label={label}>
              {rows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      {kind === "job" ? (
        <Field label="Название">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Что сделать" />
        </Field>
      ) : null}

      {kind !== "asset" && kind !== "episode" && kind !== "job" ? (
        <Field label="Сцена">
          <Select
            value={sceneId}
            onChange={(e) => {
              setSceneId(e.target.value);
              setShotId("");
            }}
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {s.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {kind === "shot" ? (
        <>
          <Field label="Существующий шот">
            <Select value={shotId} onChange={(e) => setShotId(e.target.value)} disabled={Boolean(newShot)}>
              <option value="">выберите…</option>
              {shots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Или новый шот" hint="Например Shot_28 — создастся в выбранной сцене">
            <Input value={newShot} onChange={(e) => setNewShot(e.target.value)} placeholder="Shot_28" />
          </Field>
        </>
      ) : null}

      {kind === "asset" ? (
        <>
          <Field label="Существующий ассет">
            <Select value={assetId} onChange={(e) => setAssetId(e.target.value)} disabled={Boolean(newAsset)}>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Или новый ассет">
            <Input value={newAsset} onChange={(e) => setNewAsset(e.target.value)} placeholder="Имя персонажа или пропа" />
          </Field>
          {newAsset ? (
            <Field label="Тип">
              <Select value={assetKind} onChange={(e) => setAssetKind(e.target.value)}>
                <option value="character">персонаж</option>
                <option value="location">локация</option>
                <option value="prop">проп</option>
              </Select>
            </Field>
          ) : null}
        </>
      ) : null}

      {stages.length > 1 ? (
        <Field label="Этап">
          <Select value={stage} onChange={(e) => setStage(e.target.value)}>
            {stages.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s] || s}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label="Исполнитель"
        hint={
          needSkills.length
            ? skilledPeople.length
              ? `Нужен скил: ${needSkills.map((c) => SKILL_LABEL[c] || c).join(" / ")}`
              : `Скил «${needSkills.map((c) => SKILL_LABEL[c] || c).join(" / ")}» ни у кого не отмечен — показаны все. Отметьте скилы в карточке сотрудника.`
            : "Без назначения сотрудник задачу не увидит"
        }
      >
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} required>
          <option value="">выберите сотрудника</option>
          {assigneeList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Начало">
          <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Окончание">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
      </div>
      <Field label="Комментарий">
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что сделать, референс, ограничения" />
      </Field>
      <Field
        label="Материалы из хранилища"
        hint="Логотип, концепт, сценарий, модель — сотрудник увидит превью в карточке задачи"
      >
        <LibraryPicker selected={libraryIds} onChange={setLibraryIds} />
      </Field>
      <Button disabled={busy} type="submit">
        Создать и назначить
      </Button>
    </form>
  );
}
