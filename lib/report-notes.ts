import { stageLabels } from './funnel';

export function formatReportNote(note: string | null) {
  if (!note) return '';

  const stageChange = note.match(/^Etapa alterada para ([A-Z_]+)\.$/);
  if (stageChange) {
    const stageKey = stageChange[1];
    const stage = stageKey as keyof typeof stageLabels;
    return `Etapa alterada para ${stageLabels[stage] ?? stageKey.replaceAll('_', ' ').toLocaleLowerCase('pt-BR')}.`;
  }

  return note.replace(/\b(NEW|CONTACTED|IN_CONVERSATION|INTEREST|QUALIFIED|PROPOSAL|MEETING|FOLLOW_UP|WON|NO_RESPONSE|DISCARDED)\b/g, (stageKey) => {
    const stage = stageKey as keyof typeof stageLabels;
    return stageLabels[stage] ?? stageKey.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
  });
}
