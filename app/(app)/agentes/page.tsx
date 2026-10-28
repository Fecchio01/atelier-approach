import { PageHeading } from '@/components/ui';
import { AgentWorkspace, type AgentWorkspaceRun } from '@/components/agent-workspace';
import { automationPolicy } from '@/lib/agents/policy';
import { prisma } from '@/lib/db';

export default async function AgentsPage() {
  const [leads, records] = await Promise.all([
    prisma.lead.findMany({
      where: { stage: { notIn: ['WON', 'DISCARDED'] }, name: { not: null } },
      orderBy: [{ stageEnteredAt: 'desc' }, { name: 'asc' }],
      take: 60,
      select: { id: true, name: true, stage: true, phone: true, whatsapp: true, version: true }
    }),
    prisma.agentRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        lead: { select: { id: true, name: true, stage: true, version: true } },
        actions: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    })
  ]);
  const runs: AgentWorkspaceRun[] = records.map((run) => ({
    id: run.id,
    status: run.status,
    policyVersion: run.policyVersion,
    createdAt: run.createdAt.toISOString(),
    lead: run.lead,
    result: run.result as AgentWorkspaceRun['result'],
    actions: run.actions.map((action) => ({
      id: action.id,
      status: action.status,
      approvalHash: action.approvalHash,
      title: action.title,
      description: action.description,
      taskType: action.taskType,
      priority: action.priority,
      dueDate: action.dueDate.toISOString()
    }))
  }));

  return <section className="mx-auto max-w-[1520px] px-5 py-7 md:px-8 md:py-9">
    <PageHeading eyebrow="Automação assistida" title="Sugestões para avançar o CRM" description="Analise uma empresa já cadastrada, revise fatos e aprove cada tarefa antes que ela entre na fila do CRM." />
    <div className="mt-6 rounded-2xl border border-[var(--atelier-line)] bg-[var(--atelier-surface)] p-4 text-sm text-white/65 sm:p-5">
      <p className="font-semibold text-white">Primeira versão: sem custo de modelo e sem envio automático</p>
      <p className="mt-1">A análise usa somente os dados salvos no CRM. Não verifica informações externas, não muda etapa, venda ou MRR e não envia mensagens. Cada tarefa exige aprovação.</p>
      <p className="mt-2 text-xs text-white/45">Política {automationPolicy.version} · até {automationPolicy.maxRunsPerMemberPerDay} análises por membro/dia</p>
    </div>
    <AgentWorkspace initialLeads={leads.map((lead) => ({ ...lead, name: lead.name ?? 'Empresa sem nome' }))} initialRuns={runs} />
  </section>;
}
