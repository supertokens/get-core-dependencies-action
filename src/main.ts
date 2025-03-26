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

        console.log(branchDates)

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

      const pluginInterfaceRepo = `https://github.com/supertokens/supertokens-plugin-interface.git`
      // Clone plugin-interface repo
      const pluginInterfaceTempDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'plugin-interface-')
      )
      await execAsync(
        `git clone ${pluginInterfaceRepo} ${pluginInterfaceTempDir}`
      )

      // Get remote branches
      const { stdout: pluginInterfaceBranches } = await execAsync(
        'git for-each-ref --format="%(refname:short)" refs/remotes/origin/',
        { cwd: pluginInterfaceTempDir }
      )

      const pluginInterfaceRemoteBranches = pluginInterfaceBranches
        .split('\n')
        .filter((b) => b !== '' && b !== 'HEAD' && !b.includes('->'))

      // Sort branches by commit date
      const pluginInterfaceBranchDates = await Promise.all(
        pluginInterfaceRemoteBranches.map(async (branch) => {
          const { stdout } = await execAsync(
            `git log -1 --format=%ct ${branch}`,
            { cwd: pluginInterfaceTempDir }
          )
          return {
            branch: branch.replace('origin/', ''),
            timestamp: parseInt(stdout.trim())
          }
        })
      )

      pluginInterfaceBranchDates.sort((a, b) => b.timestamp - a.timestamp)

      console.log(pluginInterfaceBranchDates)

      for (const { branch } of pluginInterfaceBranchDates) {
        console.log(`Checking plugin-interface branch ${branch}`)
        try {
          // Checkout the branch
          await execAsync(`git checkout origin/${branch}`, {
            cwd: pluginInterfaceTempDir
          })

          // Read build.gradle and extract version
          const content = await fs.readFile(
            `${pluginInterfaceTempDir}/build.gradle`,
            'utf-8'
          )
          const versionMatch = content.match(
            /version\s*=\s*['"](\d+\.\d+)\.\d+['"]/
          )

          if (versionMatch) {
            const branchVersion = versionMatch[1] // Gets the X.Y part from X.Y.Z
            const pluginMajorMinor = pluginVersion
              .split('.')
              .slice(0, 2)
              .join('.')

            if (branchVersion === pluginMajorMinor) {
              branches['plugin-interface'] = branch
              break
            }
          }
        } catch (e) {
          // Skip if file not found or other errors
          continue
        }
      }

      // Cleanup: Remove the temporary directory
      await fs.rm(pluginInterfaceTempDir, { recursive: true, force: true })

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
