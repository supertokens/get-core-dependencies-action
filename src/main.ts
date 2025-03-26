import * as core from '@actions/core'
import { Octokit } from '@octokit/rest'
import * as fs from 'fs/promises'

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
    const octokit = new Octokit()

    if (runningFor === 'core') {
      const plugins = ['postgresql', 'mysql', 'mongodb']
      for (const plugin of plugins) {
        console.log(`Getting branches for ${plugin}`)

        const { data: branchData } = await octokit.repos.listBranches({
          owner: 'supertokens',
          repo: `supertokens-${plugin}-plugin`
        })

        // Sort branches by their last commit date in descending order
        const sortedBranches = await Promise.all(
          branchData.map(async (branch) => {
            const { data: branchInfo } = await octokit.repos.getBranch({
              owner: 'supertokens',
              repo: `supertokens-${plugin}-plugin`,
              branch: branch.name
            })
            return {
              name: branch.name,
              date: new Date(branchInfo.commit.commit.author?.date ?? '')
            }
          })
        )

        sortedBranches.sort((a, b) => b.date.getTime() - a.date.getTime())
        const sortedBranchData = sortedBranches.map((branch) => ({
          name: branch.name
        }))

        console.log(sortedBranchData)

        for (const branch of sortedBranchData) {
          console.log(`Checking branch ${branch.name}`)
          try {
            // Get pluginInterfaceSupported.json content
            const { data: fileData } = await octokit.repos.getContent({
              owner: 'supertokens',
              repo: `supertokens-${plugin}-plugin`,
              path: 'pluginInterfaceSupported.json',
              ref: branch.name
            })

            if (Array.isArray(fileData)) {
              console.log(`${branch.name} returned multiple files`)
              continue
            }

            if (fileData.type !== 'file') {
              console.log(`${branch.name} is not a file`)
              continue
            }

            const content = Buffer.from(fileData.content, 'base64').toString()
            const { versions } = JSON.parse(content)

            if (versions[0] === pluginVersion) {
              branches[plugin] = branch.name
              break
            }
          } catch (e) {
            // Skip if file not found or other errors
            continue
          }
        }
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
