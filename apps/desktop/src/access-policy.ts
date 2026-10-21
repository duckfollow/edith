export interface AccessPolicy {
  role: string;
  username?: string;
  mode?: string;
  viewBodies: boolean;
  revealCredentials: boolean;
  exportData: boolean;
  manageGateway: boolean;
  manageConnections: boolean;
}
export let workspacePolicy: AccessPolicy = {
  role: "checking",
  viewBodies: false,
  revealCredentials: false,
  exportData: false,
  manageGateway: false,
  manageConnections: false,
};
export async function loadAccessPolicy() {
  try {
    const response = await fetch("/__edith_access/policy", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (
      !["viewer", "developer", "admin"].includes(data.role) ||
      [
        "viewBodies",
        "revealCredentials",
        "exportData",
        "manageGateway",
        "manageConnections",
      ].some((k) => typeof data[k] !== "boolean")
    )
      throw Error();
    workspacePolicy = data;
  } catch {
    workspacePolicy = {
      role: "unavailable",
      viewBodies: false,
      revealCredentials: false,
      exportData: false,
      manageGateway: false,
      manageConnections: false,
    };
  }
  return workspacePolicy;
}
