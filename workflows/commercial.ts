import { createHook, getWorkflowMetadata } from 'workflow';

import { prisma } from '@/lib/db';
import { analyzeLead, hashApproval } from '@/lib/agents/model';

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

  const run = await prisma.agentRun.findUnique({ where: { id: runId }, include: { lead: true } });
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
  const result = analyzeLead(snapshot);
  const recommendation = result.recommendation;
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
        result: JSON.parse(JSON.stringify(result)),
        startedAt: run.startedAt ?? new Date(),
        error: null
      }
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
