import { decodeBackup, encodeBackup } from '../src/backup.ts';
import { MAX_SAVE_TEXT } from '../src/transfer.ts';
import { LEVELS } from '../src/levels.ts';

const file = 'cube-dash.cdb';
const name = 'com.royashbrook.dash';
const sha = /^[0-9a-f]{40}$/;
export class BackupError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function boundedText(response, cap) {
  if (Number(response.headers.get('content-length')) > cap)
    throw new BackupError(413, 'Save exceeds the pilot limit.');
  if (!response.body) throw new BackupError(400, 'Missing data.');
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', {fatal: true});
  let size = 0, text = '';
  try {
    for (;;) {
      const {value, done} = await reader.read();
      if (done) return text + decoder.decode();
      size += value.length;
      if (size > cap) {
        await reader.cancel();
        throw new BackupError(413, 'Save exceeds the pilot limit.');
      }
      text += decoder.decode(value, {stream: true});
    }
  } finally { reader.releaseLock(); }
}

// Binding comes from operator config and authenticated server state, never a browser path.
export function vault(binding, token, send = fetch) {
  const request = (path, options) => send('https://api.github.com' + path, {
    ...options, redirect: 'error', headers: {Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json', 'User-Agent': 'cube-dash-backup',
      'Content-Type': 'application/json'},
  });
  async function json(response, cap = 65536) {
    if (!response.ok) throw new BackupError(
      [401,403,429].includes(response.status) ? response.status : 502,
      'GitHub could not complete the backup request.');
    return JSON.parse(await boundedText(response, cap));
  }
  async function selected(allowMissing = false) {
    const installation = await json(await request('/user/installations?per_page=2'));
    const items = installation.installations;
    if (allowMissing && installation.total_count === 0 && items.length === 0) return null;
    if (installation.total_count !== 1 || items.length !== 1 ||
        items[0].account.id !== binding.user || items[0].repository_selection !== 'selected' ||
        items[0].suspended_at || items[0].permissions.contents !== 'write')
      throw new BackupError(403, 'Backup requires a selected-repositories grant, not all repositories.');
    const list = await json(await request('/user/installations/' + items[0].id + '/repositories?per_page=2'));
    if (list.total_count !== list.repositories.length || list.total_count > 1)
      throw new BackupError(403, 'Backup will not access unrelated repositories.');
    return {repos:list.repositories, permissions:items[0].permissions};
  }
  function owned(repo) {
    return repo?.name === name && repo.private === true && repo.owner?.type === 'User' && repo.owner.id === binding.user &&
      Number.isSafeInteger(repo.id) && repo.id > 0 && !repo.archived && !repo.fork && repo.default_branch;
  }
  async function verify() {
    const list = await selected();
    const repo = list.repos[0];
    if (!owned(repo) || repo.id !== binding.repo)
      throw new BackupError(403, 'The dedicated private save repository is not available.');
    return {root: '/repos/' + repo.full_name.split('/').map(encodeURIComponent).join('/'),
      branch: repo.default_branch};
  }
  return {
    async provision(db) {
      const grant = await selected(true);
      if (!grant) return null;
      const row = await db.prepare('select repo_id from backup_vaults where user_id=?').bind(binding.user).first();
      let repo = grant.repos[0];
      if (row) {
        if (!owned(repo) || repo.id !== row.repo_id)
          throw new BackupError(403,'Your original backup repository is unavailable. No replacement was created.');
        return repo.id;
      }
      if (!repo) {
        if (grant.permissions.repository_creation !== 'write')
          throw new BackupError(403,'Approve the GitHub App repository creation permission to enable backups.');
        const res = await request('/user/repos',{method:'POST',body:JSON.stringify({name,description:'Cube Dash private backup',
          private:true,auto_init:true,has_issues:false,has_projects:false,has_wiki:false})});
        if (res.status === 422) {
          // A concurrent login may have created it. A name collision alone is not a grant.
          repo = (await selected()).repos[0];
        } else if (res.status === 201) repo = await json(res);
        else throw new BackupError(503,'GitHub could not create your backup. No save was uploaded.');
      }
      if (!owned(repo))
        throw new BackupError(409,'Select only your private com.royashbrook.dash repository on GitHub. No save was uploaded.');
      await db.prepare('insert or ignore into backup_vaults (user_id, repo_id) values (?, ?)')
        .bind(binding.user,repo.id).run();
      const saved=await db.prepare('select repo_id from backup_vaults where user_id=?').bind(binding.user).first();
      if (saved?.repo_id !== repo.id) throw new BackupError(409,'Backup destination changed.');
      return repo.id;
    },
    async read() {
      const {root, branch} = await verify();
      const res = await request(root + '/contents/' + file + '?ref=' + encodeURIComponent(branch));
      if (res.status === 404) return null;
      const entry = await json(res, 2 * 1024 * 1024);
      if (entry.type !== 'file' || entry.path !== file || !sha.test(entry.sha) ||
          !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > MAX_SAVE_TEXT)
        throw new BackupError(422, 'The remote backup is not a supported save file.');
      const blob = entry.encoding === 'base64' ? entry :
        await json(await request(root + '/git/blobs/' + entry.sha), MAX_SAVE_TEXT * 2);
      if (blob.sha !== entry.sha || blob.encoding !== 'base64') throw new BackupError(422, 'Invalid remote file.');
      const code = atob(blob.content);
      if (code.length !== entry.size || !code.startsWith('cdb1.')) throw new BackupError(422, 'Invalid remote save.');
      await decodeBackup(code, LEVELS.length);
      return {sha: entry.sha, code};
    },
    async write(code, previous) {
      if (previous !== null && !sha.test(previous)) throw new BackupError(400, 'Invalid previous revision.');
      if (!code.startsWith('cdb1.')) throw new BackupError(422, 'Expected a Cube Dash save.');
      const canonical = await encodeBackup(await decodeBackup(code, LEVELS.length), LEVELS.length);
      const {root, branch} = await verify();
      const res = await request(root + '/contents/' + file, {method: 'PUT', body: JSON.stringify({
        message: 'Back up Cube Dash', branch, content: btoa(canonical), ...(previous ? {sha: previous} : {}),
      })});
      if (res.status === 409 || res.status === 422) throw new BackupError(409, 'Backup changed. Review the other copy.');
      const result = await json(res);
      if (!sha.test(result.content?.sha)) throw new BackupError(502, 'GitHub did not confirm the save.');
      return result.content.sha;
    },
  };
}
