/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License in the project root for license information.
 */

import * as vscode from "vscode";

import * as engineConstants from "../../core/common/constants/engine";
import * as configurationConstants from "../../core/common/constants/workspace-configuration";
import * as stateConstants from "../../core/common/constants/workspace-state";
import { ConverterEngineFactory } from "../../core/converter/converter-factory";
import { globals } from "../../core/globals";
import localize from "../../i18n/localize";
import * as unusedSegmentsDiagnostic from "../common/diagnostic/used-segments-diagnostic";
import { showDifferentialView } from "../common/editor/show-differential-view";
import { showResultEditor } from "../common/editor/show-result-editor";
import * as interaction from "../common/file-dialog/file-dialog-interaction";

export async function convertCommand() {
	// Add conversion bar
	const conversionBar: vscode.StatusBarItem =
		vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

	conversionBar.text = "$(sync~spin) Converting...";

	conversionBar.show();

	try {
		// Check whether there is any template not saved and ask if users want to save it
		const unsavedTemplates: vscode.TextDocument[] =
			interaction.getUnsavedFiles(engineConstants.TemplateFileExt);

		if (unsavedTemplates.length > 0) {
			await interaction.askSaveFiles(
				unsavedTemplates,
				localize("message.saveTemplatesBeforeRefresh"),
				localize("message.save"),
				localize("message.ignore"),
			);
		}

		// Get the data file
		const dataFile = globals.settingManager.getWorkspaceState(
			stateConstants.DataKey,
		);

		// Check whether data file is dirty and not saved and ask if users want to save it
		const doc = interaction.isDirtyFile(dataFile);

		if (doc) {
			await interaction.askSaveFiles(
				[doc],
				localize("message.saveDataBeforeRefresh"),
				localize("message.save"),
				localize("message.ignore"),
			);
		}

		// create the converter
		const converter =
			ConverterEngineFactory.getInstance().createConverter();

		// Execute the conversion process
		const result = await converter.convert(dataFile);

		// Add trace info to the template
		const enableUnusedSegmentsDiagnostic =
			globals.settingManager.getWorkspaceConfiguration(
				configurationConstants.enableUnusedSegmentsDiagnosticKey,
			);

		if (enableUnusedSegmentsDiagnostic) {
			const traceInfo = result.traceInfo;

			unusedSegmentsDiagnostic.updateDiagnostics(
				vscode.Uri.file(dataFile),
				traceInfo["UnusedSegments"],
			);
		} else {
			unusedSegmentsDiagnostic.clearDiagnostics();
		}

		// Open the data in the editor
		await vscode.window.showTextDocument(vscode.Uri.file(dataFile), {
			viewColumn: vscode.ViewColumn.One,
		});

		// Open the template in the editor
		const templateFile = globals.settingManager.getWorkspaceState(
			stateConstants.TemplateKey,
		);

		await vscode.window.showTextDocument(vscode.Uri.file(templateFile), {
			viewColumn: vscode.ViewColumn.Two,
		});

		// Obtain the enableDiffView option from the settings.
		const enableDiff = globals.settingManager.getWorkspaceConfiguration(
			configurationConstants.enableDiffViewKey,
		);

		if (!enableDiff) {
			await showResultEditor(vscode.Uri.file(result.resultFile));
		} else {
			// Get the history
			const history = converter.getHistory(result.resultFile);

			if (history.length === 1) {
				// Show result in the editor
				await showResultEditor(vscode.Uri.file(history[0]));
			} else if (history.length > 1) {
				// Show result with the differential view
				await showDifferentialView(
					vscode.Uri.file(history[1]),
					vscode.Uri.file(history[0]),
				);
			}
		}

		await vscode.commands.executeCommand(
			"workbench.action.closeOtherEditors",
		);
	} finally {
		// hide the conversion bar
		conversionBar.hide();
	}
}
