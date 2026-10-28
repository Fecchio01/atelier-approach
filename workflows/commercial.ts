import { createHook, getWorkflowMetadata } from 'workflow';

import { prisma } from '@/lib/db';
import { hashApproval } from '@/lib/agents/model';
import { analyzeLeadWithGeminiWhenAllowed } from '@/lib/agents/gemini';
import { analyzeCompany } from '@/lib/agents/specialists/commercial-analysis';

type WorkflowDecision = { decision: 'APPROVE' | 'REJECT'; approvalHash: string };

export async function commercialLeadAnalysis(runId: string) {
  'use workflow';

  using approval = createHook<WorkflowDecision>({ token: `agent-run-approval:${runId}` });
  const conflict = await approval.getConflict();
  if (conflict) return { deduped: true };

  const { workflowRunId } = getWorkflowMetadata();
  const pending = await createReviewSuggestion(runId, workflowRunId, approval.token);
  if (!pending) return { skipped: true };

  const decision = await approval;
  return completeAfterDecision(runId, decision);
}

async function createReviewSuggestion(runId: string, workflowRunId: string, approvalToken: string) {
  'use step';

  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { lead: { include: { prospectCandidate: { include: { evidence: true } } } } }
  });
  if (!run || run.status === 'COMPLETED' || run.status === 'FAILED') return false;
  const lead = run.lead;
  if (lead.version !== run.leadVersion || lead.stage === 'WON' || lead.stage === 'DISCARDED' || !lead.name?.trim()) {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', error: 'A empresa mudou antes da análise; peça uma nova análise.', finishedAt: new Date() }
    });
    return false;
  }

  const snapshot = run.inputSnapshot as {
    id: string; version: number; name: string; stage: string; phone: string | null; whatsapp: string | null;
    website: string | null; instagram: string | null; address: string | null; category: string | null;
  };
  let result;
  try {
    result = await analyzeLeadWithGeminiWhenAllowed(snapshot);
  } catch {
    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        error: 'Não foi possível concluir a análise externa. Confira a chave do Gemini e a faixa gratuita do projeto.',
        finishedAt: new Date()
      }
    });
    return false;
  }
  const recommendation = result.recommendation;
  const [services, latestEvidence] = await Promise.all([
    prisma.serviceCatalogItem.findMany({ where: { isActive: true }, select: { id: true, name: true, scope: true, deliverables: true, restrictions: true } }),
    prisma.researchEvidence.findMany({
      where: { candidateId: lead.prospectCandidate?.id, verified: true },
      orderBy: { capturedAt: 'desc' },
      take: 30,
      select: { id: true, field: true, value: true, sourceUrl: true, verified: true }
    })
  ]);
  const diagnosis = analyzeCompany({
    id: lead.id, version: lead.version, name: lead.name, category: lead.category, address: lead.address,
    phone: lead.phone, whatsapp: lead.whatsapp, website: lead.website, instagram: lead.instagram, stage: lead.stage,
    evidence: latestEvidence
  }, services);
  const completeResult = { ...result, ...diagnosis.result };
  const approvalHash = hashApproval(recommendation);

  await prisma.$transaction(async (tx) => {
    await tx.agentAction.upsert({
      where: { runId_leadVersion: { runId: run.id, leadVersion: run.leadVersion } },
      create: {
        runId: run.id,
        leadId: lead.id,
        approvalToken,
        approvalHash,
        leadVersion: run.leadVersion,
        title: recommendation.title,
        description: recommendation.description,
        dueDate: new Date(recommendation.dueDate),
        taskType: recommendation.taskType,
        priority: recommendation.priority
      },
      update: {}
    });
    await tx.agentRun.update({
      where: { id: run.id },
      data: {
        workflowRunId,
        status: 'NEEDS_APPROVAL',
        result: JSON.parse(JSON.stringify(completeResult)),
        startedAt: run.startedAt ?? new Date(),
        error: null
      }
    });
    await tx.companyAnalysis.upsert({
      where: { leadId_evidenceFingerprint: { leadId: lead.id, evidenceFingerprint: diagnosis.evidenceFingerprint } },
      create: {
        leadId: lead.id,
        leadVersion: lead.version,
        evidenceFingerprint: diagnosis.evidenceFingerprint,
        promptVersion: diagnosis.result.commercialAnalysis?.version ?? 'commercial-analysis-v1',
        result: JSON.parse(JSON.stringify(diagnosis.result))
      },
      update: { leadVersion: lead.version, result: JSON.parse(JSON.stringify(diagnosis.result)) }
    });
  });

  return true;
}

async function completeAfterDecision(runId: string, decision: WorkflowDecision) {
  'use step';

  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { actions: true } });
  if (!run) return { skipped: true };
  const action = run.actions[0];
  if (!action || action.approvalHash !== decision.approvalHash) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'FAILED', error: 'A aprovação não corresponde à sugestão salva.', finishedAt: new Date() } });
    return { failed: true };
  }

  const completed = action.status === 'APPLIED' || action.status === 'REJECTED' || action.status === 'STALE';
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: completed ? 'COMPLETED' : 'NEEDS_APPROVAL',
      finishedAt: completed ? new Date() : null
    }
  });
  return { status: completed ? 'COMPLETED' : 'NEEDS_APPROVAL' };
}
