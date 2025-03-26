import * as core from '@actions/core'
import * as fs from 'fs/promises'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const runningFor: string = core.getInput('running-for')

    const commonFile = await fs.readFile(
      'pluginInterfaceSupported.json',
      'utf-8'
    )
    const pluginVersions = JSON.parse(commonFile)
    const pluginVersion = pluginVersions.versions[0]

    const branches: Record<string, string> = {}

    if (runningFor === 'core') {
      const plugins = ['postgresql', 'mysql', 'mongodb']

      for (const plugin of plugins) {
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
          .map((b) => b.trim().replace('origin/', ''))
          .filter((b) => b !== '' && b !== 'HEAD' && !b.includes('->'))

        // Sort branches by commit date
        const branchDates = await Promise.all(
          remoteBranches.map(async (branch) => {
            const { stdout } = await execAsync(
              `git show -s --format=%ct refs/remotes/origin/${branch}`,
              { cwd: tempDir }
            )
            return { branch, timestamp: parseInt(stdout.trim()) }
          })
        )

        branchDates.sort((a, b) => b.timestamp - a.timestamp)

        for (const { branch } of branchDates) {
          console.log(`Checking branch ${branch}`)
          try {
            // Checkout the branch
            await execAsync(`git checkout origin/${branch}`, { cwd: tempDir })

            // Read and parse pluginInterfaceSupported.json
            const content = await fs.readFile(
              `${tempDir}/pluginInterfaceSupported.json`,
              'utf-8'
            )
            const { versions } = JSON.parse(content)

            if (versions[0] === pluginVersion) {
              branches[plugin] = branch
              break
            }
          } catch (e) {
            // Skip if file not found or other errors
            continue
          }
        }

        // Cleanup: Remove the temporary directory
        await fs.rm(tempDir, { recursive: true, force: true })
      }

      console.log(branches)
      core.setOutput('branches', JSON.stringify(branches))
    } else {
      core.setOutput('branches', JSON.stringify({}))
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
