import { stageLabels } from './funnel';

export function formatReportNote(note: string | null) {
  if (!note) return '';

  const stageChange = note.match(/^Etapa alterada para ([A-Z_]+)\.$/);
  if (!stageChange) return note;

  const stage = stageChange[1] as keyof typeof stageLabels;
  const label = stageLabels[stage] ?? stage.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
  return `Etapa alterada para ${label}.`;
}
