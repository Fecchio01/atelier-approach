export function isCronAuthExemptPath(pathname: string): boolean {
  return pathname === '/api/cron/crm-lifecycle';
}
