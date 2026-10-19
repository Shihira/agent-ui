export const APIRoutes = {
  GetAgents: (agentOSUrl: string) => `${agentOSUrl}/agents`,
  AgentRun: (agentOSUrl: string) => `${agentOSUrl}/agents/{agent_id}/runs`,
  AgentRunResume: (agentOSUrl: string, agentId: string, runId: string) =>
    `${agentOSUrl}/agents/${agentId}/runs/${runId}/resume`,
  AgentRunCancel: (agentOSUrl: string, agentId: string, runId: string) =>
    `${agentOSUrl}/agents/${agentId}/runs/${runId}/cancel`,
  Status: (agentOSUrl: string) => `${agentOSUrl}/health`,
  GetSessions: (agentOSUrl: string) => `${agentOSUrl}/sessions`,
  GetSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}/runs`,

  DeleteSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}`,
  RenameSession: (agentOSUrl: string, sessionId: string) =>
    `${agentOSUrl}/sessions/${sessionId}/rename`,
  ForkAgentSession: (
    agentOSUrl: string,
    agentId: string,
    sessionId: string
  ) => `${agentOSUrl}/agents/${agentId}/sessions/${sessionId}/fork`,
  ForkTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    `${agentOSUrl}/teams/${teamId}/sessions/${sessionId}/fork`,

  GetTeams: (agentOSUrl: string) => `${agentOSUrl}/teams`,
  TeamRun: (agentOSUrl: string, teamId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs`,
  TeamRunResume: (agentOSUrl: string, teamId: string, runId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs/${runId}/resume`,
  TeamRunCancel: (agentOSUrl: string, teamId: string, runId: string) =>
    `${agentOSUrl}/teams/${teamId}/runs/${runId}/cancel`,
  DeleteTeamSession: (agentOSUrl: string, teamId: string, sessionId: string) =>
    `${agentOSUrl}/v1//teams/${teamId}/sessions/${sessionId}`
}
