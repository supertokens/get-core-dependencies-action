import * as core from '@actions/core'

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    // const pluginVersion: string = core.getInput('plugin-version')

    core.setOutput('branches', {
      'plugin-interface': '7.1',
      postgresql: 'fix/test-speed',
      mysql: '8.1',
      mongodb: '1.31'
    })
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
