import * as path from 'path';
import * as subProcess from './sub-process';
import * as fs from 'fs';
import * as tmp from 'tmp';

import { legacyCommon, legacyPlugin as api } from '@snyk/cli-interface';
type DepTree = legacyCommon.DepTree;

export const __tests = {
  buildArgs,
};

export interface PythonInspectOptions {
  command?: string;
  allowMissing?: boolean;
  args?: string[];
}

type Options = api.SingleSubprojectInspectOptions & PythonInspectOptions;

export async function inspect(
  root: string,
  targetFile: string,
  options?: Options
): Promise<api.SinglePackageResult> {
  if (!options) {
    options = {};
  }
  let command = options.command || 'python';
  const includeDevDeps = !!(options.dev || false);
  let baseargs: string[] = [];

  if (path.basename(targetFile) === 'Pipfile') {
    // Check that pipenv is available by running it.
    const pipenvCheckProc = subProcess.executeSync('pipenv', ['--version']);
    if (pipenvCheckProc.status !== 0) {
      throw new Error(
        'Failed to run `pipenv`; please make sure it is installed.'
      );
    }
    command = 'pipenv';
    baseargs = ['run', 'python'];
  }

  const [plugin, pkg] = await Promise.all([
    getMetaData(command, baseargs, root, targetFile),
    getDependencies(
      command,
      baseargs,
      root,
      targetFile,
      options.allowMissing || false,
      includeDevDeps,
      options.args
    ),
  ]);
  return { plugin, package: pkg };
}

interface UpgradeRemediation {
  upgradeTo: string;
  // Other fields are of no interest
}

interface DependencyUpdates {
  [from: string]: UpgradeRemediation;
}

interface ManifestFiles {
  // Typically these are requirements.txt, constraints.txt and Pipfile;
  // the plugin supports paths with subdirectories
  [name: string]: string; // name-to-content
}

// Correction for the type; should be fixed in snyk-cli-interface
export interface DepTreeDep {
  name?: string; // shouldn't, but might be missing
  version?: string; // shouldn't, but might be missing
  dependencies?: {
    [depName: string]: DepTreeDep;
  };
  labels?: {
    [key: string]: string;

    // Known keys:
    // pruned: identical subtree already presents in the parent node.
    //         See --prune-repeated-subdependencies flag.
  };
}

// Applies upgrades to direct and indirect dependencies
export async function applyRemediationToManifests(
  root: string,
  manifests: ManifestFiles,
  upgrades: DependencyUpdates,
  options: Options
) {
  const manifestNames = Object.keys(manifests);
  const targetFile = manifestNames.find(
    (fn) => path.basename(fn) === 'requirements.txt'
  );
  if (
    !targetFile ||
    !manifestNames.every(
      (fn) =>
        path.basename(fn) === 'requirements.txt' ||
        path.basename(fn) === 'constraints.txt'
    )
  ) {
    throw new Error(
      'Remediation only supported for requirements.txt and constraints.txt files'
    );
  }

  const provOptions = { ...options };
  provOptions.args = provOptions.args || [];
  provOptions.args.push('--only-provenance');

  const topLevelDeps = (await inspect(root, targetFile, provOptions)).package;
  applyUpgrades(manifests, upgrades, topLevelDeps);

  return manifests;
}

function applyUpgrades(
  manifests: ManifestFiles,
  upgrades: DependencyUpdates,
  topLevelDeps: DepTree
) {
  const requirementsFileName = Object.keys(manifests).find(
    (fn) => path.basename(fn) === 'requirements.txt'
  ) as string;
  const constraintsFileName = Object.keys(manifests).find(
    (fn) => path.basename(fn) === 'constraints.txt'
  );

  // Updates to requirements.txt
  const patch: { [zeroBasedIndex: number]: string | false } = {}; // false means remove the line
  const append: string[] = [];

  const originalRequirementsLines = manifests[requirementsFileName].split('\n');

  const extraMarkers = /--| \[|;/;

  for (const upgradeFrom of Object.keys(upgrades)) {
    const pkgName = upgradeFrom.split('@')[0].toLowerCase();
    const newVersion = upgrades[upgradeFrom].upgradeTo.split('@')[1];
    const topLevelDep = (topLevelDeps.dependencies || {})[
      pkgName
    ] as DepTreeDep;
    if (topLevelDep && topLevelDep.labels && topLevelDep.labels.provenance) {
      // Top level dependency, to be updated in a manifest

      const lineNumbers = topLevelDep.labels.provenance
        .split(':')[1]
        .split('-')
        .map((x) => parseInt(x));
      // TODO(kyegupov): what if the original version spec was range, e.g. >=1.0,<2.0 ?
      // TODO(kyegupov): prevent downgrades
      const firstLineNo = lineNumbers[0] - 1;
      const lastLineNo =
        lineNumbers.length > 1 ? lineNumbers[1] - 1 : lineNumbers[0] - 1;
      const originalRequirementString = originalRequirementsLines
        .slice(firstLineNo, lastLineNo + 1)
        .join('\n')
        .replace(/\\\n/g, '');
      const firstExtraMarkerPos = originalRequirementString.search(
        extraMarkers
      );
      if (firstExtraMarkerPos > -1) {
        // maybe we should reinstate linebreaks here?
        patch[lineNumbers[0] - 1] =
          pkgName +
          '==' +
          newVersion +
          ' ' +
          originalRequirementString.slice(firstExtraMarkerPos).trim();
      } else {
        patch[lineNumbers[0] - 1] = pkgName + '==' + newVersion;
      }
      if (lastLineNo > firstLineNo) {
        for (let i = firstLineNo + 1; i <= lastLineNo; i++) {
          patch[i - 1] = false;
        }
      }
    } else {
      // The dependency is not a top level: we are pinning a transitive using constraints file.
      if (!constraintsFileName) {
        append.push(
          pkgName +
            '>=' +
            newVersion +
            ' # not directly required, pinned by Snyk to avoid a vulnerability'
        );
      } else {
        // TODO(kyegupov): parse constraints and replace the pre-existing one if any
        const lines = manifests[constraintsFileName].trim().split('\n');
        lines.push(
          pkgName +
            '>=' +
            newVersion +
            ' # pinned by Snyk to avoid a vulnerability'
        );
        manifests[constraintsFileName] = lines.join('\n') + '\n';
      }
    }
  }
  const lines: string[] = [];
  originalRequirementsLines.forEach((line, i) => {
    if (patch[i] === false) {
      return;
    }
    if (patch[i]) {
      lines.push(patch[i] as string);
    } else {
      lines.push(line);
    }
  });
  // Drop extra trailing newlines
  while (lines.length > 0 && !lines[lines.length - 1]) {
    lines.pop();
  }
  manifests[requirementsFileName] = lines.concat(append).join('\n') + '\n';
}

function getMetaData(
  command: string,
  baseargs: string[],
  root: string,
  targetFile: string
) {
  return subProcess
    .execute(command, [...baseargs, '--version'], { cwd: root })
    .then((output) => {
      return {
        name: 'snyk-python-plugin',
        runtime: output.replace('\n', ''),
        // specify targetFile only in case of Pipfile
        targetFile:
          path.basename(targetFile) === 'Pipfile' ? targetFile : undefined,
      };
    });
}

// path.join calls have to be exactly in this format, needed by "pkg" to build a standalone Snyk CLI binary:
// https://www.npmjs.com/package/pkg#detecting-assets-in-source-code
function createAssets() {
  return [
    path.join(__dirname, '../pysrc/pip_resolve.py'),
    path.join(__dirname, '../pysrc/distPackage.py'),
    path.join(__dirname, '../pysrc/package.py'),
    path.join(__dirname, '../pysrc/pipfile.py'),
    path.join(__dirname, '../pysrc/reqPackage.py'),
    path.join(__dirname, '../pysrc/setup_file.py'),
    path.join(__dirname, '../pysrc/utils.py'),

    path.join(__dirname, '../pysrc/requirements/fragment.py'),
    path.join(__dirname, '../pysrc/requirements/parser.py'),
    path.join(__dirname, '../pysrc/requirements/requirement.py'),
    path.join(__dirname, '../pysrc/requirements/vcs.py'),
    path.join(__dirname, '../pysrc/requirements/__init__.py'),

    path.join(__dirname, '../pysrc/pytoml/__init__.py'),
    path.join(__dirname, '../pysrc/pytoml/core.py'),
    path.join(__dirname, '../pysrc/pytoml/parser.py'),
    path.join(__dirname, '../pysrc/pytoml/writer.py'),
  ];
}

function writeFile(writeFilePath: string, contents: string) {
  const dirPath = path.dirname(writeFilePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath);
  }
  fs.writeFileSync(writeFilePath, contents);
}

function getFilePathRelativeToDumpDir(filePath: string) {
  let pathParts = filePath.split('\\pysrc\\');

  // Windows
  if (pathParts.length > 1) {
    return pathParts[1];
  }

  // Unix
  pathParts = filePath.split('/pysrc/');
  return pathParts[1];
}

function dumpAllFilesInTempDir(tempDirName: string) {
  createAssets().forEach((currentReadFilePath) => {
    if (!fs.existsSync(currentReadFilePath)) {
      throw new Error('The file `' + currentReadFilePath + '` is missing');
    }

    const relFilePathToDumpDir = getFilePathRelativeToDumpDir(
      currentReadFilePath
    );

    const writeFilePath = path.join(tempDirName, relFilePathToDumpDir);

    const contents = fs.readFileSync(currentReadFilePath, 'utf8');
    writeFile(writeFilePath, contents);
  });
}

async function getDependencies(
  command: string,
  baseargs: string[],
  root: string,
  targetFile: string,
  allowMissing: boolean,
  includeDevDeps: boolean,
  args?: string[]
): Promise<DepTree> {
  const tempDirObj = tmp.dirSync({
    unsafeCleanup: true,
  });

  dumpAllFilesInTempDir(tempDirObj.name);
  try {
    // See ../pysrc/README.md
    const output = await subProcess.execute(
      command,
      [
        ...baseargs,
        ...buildArgs(
          targetFile,
          allowMissing,
          tempDirObj.name,
          includeDevDeps,
          args
        ),
      ],
      { cwd: root }
    );
    return JSON.parse(output) as DepTree;
  } catch (error) {
    if (typeof error === 'string') {
      if (error.indexOf('Required packages missing') !== -1) {
        let errMsg = error + '\nPlease run `pip install -r ' + targetFile + '`';
        if (path.basename(targetFile) === 'Pipfile') {
          errMsg = error + '\nPlease run `pipenv update`';
        }
        throw new Error(errMsg);
      }
    }
    throw error;
  } finally {
    tempDirObj.removeCallback();
  }
}

function buildArgs(
  targetFile: string,
  allowMissing: boolean,
  tempDirPath: string,
  includeDevDeps: boolean,
  extraArgs?: string[]
) {
  const pathToRun = path.join(tempDirPath, 'pip_resolve.py');
  let args = [pathToRun];
  if (targetFile) {
    args.push(targetFile);
  }
  if (allowMissing) {
    args.push('--allow-missing');
  }
  if (includeDevDeps) {
    args.push('--dev-deps');
  }
  if (extraArgs) {
    args = args.concat(extraArgs);
  }
  return args;
}
