import * as core from '@actions/core'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function getBranchForVersion(
  repo: string,
  version: string
): Promise<string> {
  console.log(`Processing ${repo}`)
  const repoUrl = `https://github.com/${repo}.git`
  const tempDir = `./temp`

  // Clone the repository
  await execAsync(`git clone ${repoUrl} ${tempDir}`)
  // Fetch all remote branches
  await execAsync('git fetch --all', { cwd: tempDir })
  // Get all branches (excluding HEAD and other special refs)
  const { stdout: branchesOutput } = await execAsync(
    'git for-each-ref --format="%(refname:short)" refs/remotes/origin/',
    { cwd: tempDir }
  )
  const remoteBranches = branchesOutput
    .split('\n')
    .map((b) => b.trim())
    // Don't replace 'origin/' here since for-each-ref already gives clean names
    .filter((b) => b !== '' && b !== 'HEAD' && !b.includes('->'))

  // Sort branches by commit date
  const branchDates = await Promise.all(
    remoteBranches.map(async (branch) => {
      const { stdout } = await execAsync(
        // Remove the extra 'origin/' since branch already includes it
        `git log -1 --format=%ct ${branch}`,
        { cwd: tempDir }
      )
      return {
        branch: branch.replace('origin/', ''), // Clean branch name for later use
        timestamp: parseInt(stdout.trim())
      }
    })
  )

  branchDates.sort((a, b) => b.timestamp - a.timestamp)
  console.log(branchDates.slice(0, 5))

  for (const { branch } of branchDates) {
    try {
      // Checkout the branch
      await execAsync(`git checkout origin/${branch}`, { cwd: tempDir })

      // Read version from build.gradle
      if (!branch.match(/^\d+\.\d+$/)) {
        continue // we only check x.y branches
      }

      const content = await fs.readFile(`${tempDir}/build.gradle`, 'utf-8')
      const versionRegex = /version\s*=\s*['"]([^'"]+)['"]/
      const match = content.match(versionRegex)
      if (!match) {
        console.log(`No version found in ${branch}`)
        continue
      }
      const versionInFile = match[1]
      console.log(`Found version ${versionInFile} in ${branch}`)
      if (versionInFile === version) {
        await fs.rm(tempDir, { recursive: true, force: true })
        console.log(`Found matching branch: ${branch}`)
        return branch
      }
    } catch (e) {
      continue
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true })
  throw new Error(
    `No matching branch found for ${repo} with plugin interface version ${version}`
  )
}

export async function runForAddDevTag() {
  const coreVersion = core.getInput('core-version')
  const pluginInterfaceVersion = core.getInput('plugin-interface-version')
  const postgresqlPluginVersion = core.getInput('postgresql-plugin-version')

  const branches: Record<string, string> = {}
  branches['core'] = await getBranchForVersion(
    'supertokens/supertokens-core',
    coreVersion
  )
  branches['plugin-interface'] = await getBranchForVersion(
    'supertokens/supertokens-plugin-interface',
    pluginInterfaceVersion
  )
  branches['postgresql'] = await getBranchForVersion(
    'supertokens/supertokens-postgresql-plugin',
    postgresqlPluginVersion
  )

  console.log(`Branches: ${JSON.stringify(branches, null, 2)}`)
  core.setOutput('branches', JSON.stringify(branches))
}
