import * as core from '@actions/core'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const PLUGINS = [
  'postgresql'

  // not supporting anymore
  // 'mysql',
  // 'mongodb'
]

async function getPluginInterfaceVersion() {
  const commonFile = await fs.readFile('pluginInterfaceSupported.json', 'utf-8')
  const pluginVersions = JSON.parse(commonFile)
  return pluginVersions.versions[0]
}

async function getBranchForPlugin(
  plugin: string,
  pluginInterfaceVersion: string,
  xyBranchesOnly: boolean
): Promise<string> {
  console.log(`Processing ${plugin}`)
  const repoUrl = `https://github.com/supertokens/supertokens-${plugin}-plugin.git`
  const tempDir = `./temp-${plugin}`

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

      // Read and parse pluginInterfaceSupported.json
      const content = await fs.readFile(
        `${tempDir}/pluginInterfaceSupported.json`,
        'utf-8'
      )
      const { versions } = JSON.parse(content)

      if (xyBranchesOnly && !branch.match(/^\d+\.\d+$/)) {
        continue
      }

      if (versions[0] === pluginInterfaceVersion) {
        // Cleanup: Remove the temporary directory
        await fs.rm(tempDir, { recursive: true, force: true })
        return branch
      }
    } catch (e) {
      continue
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true })
  throw new Error(
    `No matching branch found for ${plugin} with plugin interface version ${pluginInterfaceVersion}`
  )
}

async function getBranchForPluginInterface(
  version: string,
  xyBranchesOnly: boolean
): Promise<string> {
  if (!version.match(/^\d+\.\d+$/)) {
    return version
  }

  const repoUrl =
    'https://github.com/supertokens/supertokens-plugin-interface.git'
  const tempDir = './temp-plugin-interface'

  // Clone the repository
  await execAsync(`git clone ${repoUrl} ${tempDir}`)
  await execAsync('git fetch --all', { cwd: tempDir })

  const { stdout: branchesOutput } = await execAsync(
    'git for-each-ref --format="%(refname:short)" refs/remotes/origin/',
    { cwd: tempDir }
  )

  const remoteBranches = branchesOutput
    .split('\n')
    .map((b) => b.trim())
    .filter((b) => b !== '' && b !== 'HEAD' && !b.includes('->'))

  const branchDates = await Promise.all(
    remoteBranches.map(async (branch) => {
      const { stdout } = await execAsync(`git log -1 --format=%ct ${branch}`, {
        cwd: tempDir
      })
      return {
        branch: branch.replace('origin/', ''),
        timestamp: parseInt(stdout.trim())
      }
    })
  )

  branchDates.sort((a, b) => b.timestamp - a.timestamp)

  for (const { branch } of branchDates) {
    try {
      await execAsync(`git checkout origin/${branch}`, { cwd: tempDir })
      const gradleFile = await fs.readFile(`${tempDir}/build.gradle`, 'utf-8')
      const versionMatch = gradleFile.match(/version = ['"](.+?)['"]/)

      if (versionMatch && versionMatch[1].startsWith(version + '.')) {
        await fs.rm(tempDir, { recursive: true, force: true })
        return branch
      }
    } catch (e) {
      continue
    }
  }

  await fs.rm(tempDir, { recursive: true, force: true })
  throw new Error(
    `No matching branch found for plugin-interface with version ${version}`
  )
}

export async function runForPR() {
  try {
    const pluginInterfaceVersion = await getPluginInterfaceVersion()
    const branches: Record<string, string> = {}

    const coreBranch = (
      await execAsync('git rev-parse --abbrev-ref HEAD')
    ).stdout.trim()
    const isCoreBranchXY = coreBranch.match(/^\d+\.\d+$/) !== null

    branches['plugin-interface'] = await getBranchForPluginInterface(
      pluginInterfaceVersion,
      isCoreBranchXY
    )

    console.log(
      `Plugin matching running for core branch: ${coreBranch}, isXYBranch: ${isCoreBranchXY}\n\n`
    )

    for (const plugin of PLUGINS) {
      branches[plugin] = await getBranchForPlugin(
        plugin,
        pluginInterfaceVersion,
        isCoreBranchXY
      )
    }

    core.setOutput('branches', JSON.stringify(branches))
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
