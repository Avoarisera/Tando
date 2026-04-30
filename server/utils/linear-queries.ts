export const ISSUES_WITH_HISTORY = /* GraphQL */ `
  query GetIssues($teamId: String!, $after: DateTimeOrDuration!, $cursor: String) {
    team(id: $teamId) {
      issues(
        first: 50
        after: $cursor
        filter: { updatedAt: { gte: $after } }
      ) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          identifier
          title
          state { name type }
          assignee { id email displayName active }
          estimate
          createdAt
          startedAt
          completedAt
          updatedAt
          labels { nodes { name } }
          history(first: 30) {
            nodes {
              id
              createdAt
              fromState { name }
              toState { name }
              actor { id }
            }
          }
        }
      }
    }
  }
`

export const TEAMS_QUERY = /* GraphQL */ `
  query GetTeams {
    teams {
      nodes { id name }
    }
  }
`
