import { Octokit } from "octokit";

export async function listCodespaces(octokit: Octokit) {
  const { data } = await octokit.rest.codespaces.listForAuthenticatedUser({
    per_page: 100,
  });
  return data.codespaces || [];
}

export async function createCodespace(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  machineType: string = "basicLinux32gb"
) {
  const { data } = await octokit.rest.codespaces.createWithRepoForAuthenticatedUser({
    owner,
    repo,
    ref: branch,
    machine: machineType,
  });
  return data;
}

export async function stopCodespace(octokit: Octokit, codespaceName: string) {
  await octokit.rest.codespaces.stopForAuthenticatedUser({
    codespace_name: codespaceName,
  });
}

export async function startCodespace(octokit: Octokit, codespaceName: string) {
  await octokit.rest.codespaces.startForAuthenticatedUser({
    codespace_name: codespaceName,
  });
}

export async function deleteCodespace(octokit: Octokit, codespaceName: string) {
  await octokit.rest.codespaces.deleteForAuthenticatedUser({
    codespace_name: codespaceName,
  });
}
