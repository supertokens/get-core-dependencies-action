import * as core from '@actions/core'
import { runForPR } from './runForPR.js'
import { runForAddDevTag } from './runForAddDevTag.js'

export async function run(): Promise<void> {
  const runFor = core.getInput('run-for')
  if (runFor.toLowerCase() === 'pr') {
    const coreBranchInput = core.getInput('core-branch')
    const coreBranch = coreBranchInput || undefined
    console.log(`Running action for pr with coreBranch: ${coreBranch}`)
    await runForPR(coreBranch)
  } else if (runFor.toLowerCase() === 'add-dev-tag') {
    await runForAddDevTag()
  }
}
