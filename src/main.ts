import * as core from '@actions/core'
import { runForPR } from './runForPR.js'
import { runForAddDevTag } from './runForAddDevTag.js'

export async function run(): Promise<void> {
  const runFor = core.getInput('run-for')
  if (runFor.toLowerCase() === 'pr') {
    await runForPR()
  } else if (runFor.toLowerCase() === 'add-dev-tag') {
    await runForAddDevTag()
  }
}
