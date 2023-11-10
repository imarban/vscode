/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Action2, IAction2Options, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ViewAction } from 'vs/workbench/browser/parts/views/viewPane';
import { ActiveEditorContext } from 'vs/workbench/common/contextkeys';
import { IViewsService } from 'vs/workbench/common/views';
import { CHAT_CATEGORY } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { IChatWidgetService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { CONTEXT_PROVIDER_EXISTS } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const getMoveToEditorChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	id: `workbench.action.chat.${providerId}.openInEditor`,
	title: {
		value: localize('chat.openInEditor.label', "Open Session In Editor"),
		original: 'Open Session In Editor'
	},
	category: CHAT_CATEGORY,
	precondition: CONTEXT_PROVIDER_EXISTS,
	f1: false,
	viewId,
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		order: 0
	},
});

const getMoveToNewWindowChatActionDescriptorForViewTitle = (viewId: string, providerId: string): Readonly<IAction2Options> & { viewId: string } => ({
	id: `workbench.action.chat.${providerId}.openInNewWindow`,
	title: {
		value: localize('chat.openInNewWindow.label', "Open Session In New Window"),
		original: 'Open Session In New Window'
	},
	category: CHAT_CATEGORY,
	precondition: CONTEXT_PROVIDER_EXISTS,
	f1: false,
	viewId,
	menu: {
		id: MenuId.ViewTitle,
		when: ContextKeyExpr.equals('view', viewId),
		order: 0
	},
});

export function getMoveToEditorAction(viewId: string, providerId: string) {
	return class MoveToEditorAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getMoveToEditorChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const viewModel = view.widget.viewModel;
			if (!viewModel) {
				return;
			}

			const editorService = accessor.get(IEditorService);
			view.clear();
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId: viewModel.sessionId }, pinned: true } });
		}
	};
}

export function getMoveToNewWindowAction(viewId: string, providerId: string) {
	return class MoveToNewWindowAction extends ViewAction<ChatViewPane> {
		constructor() {
			super(getMoveToNewWindowChatActionDescriptorForViewTitle(viewId, providerId));
		}

		async runInView(accessor: ServicesAccessor, view: ChatViewPane) {
			const viewModel = view.widget.viewModel;
			if (!viewModel) {
				return;
			}

			const editorGroupService = accessor.get(IEditorGroupsService);
			const instantiationService = accessor.get(IInstantiationService);
			const sessionId = viewModel.sessionId;
			view.clear();

			const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();
			const chatEditorInput = instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), { target: { sessionId } });
			await auxiliaryEditorPart.activeGroup.openEditor(chatEditorInput, { pinned: true });
		}
	};
}

async function moveToSidebar(accessor: ServicesAccessor): Promise<void> {
	const viewsService = accessor.get(IViewsService);
	const editorService = accessor.get(IEditorService);
	const chatContribService = accessor.get(IChatContributionService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const chatEditorInput = editorService.activeEditor;
	if (chatEditorInput instanceof ChatEditorInput && chatEditorInput.sessionId && chatEditorInput.providerId) {
		await editorService.closeEditor({ editor: chatEditorInput, groupId: editorGroupService.activeGroup.id });
		const viewId = chatContribService.getViewIdForProvider(chatEditorInput.providerId);
		const view = await viewsService.openView(viewId) as ChatViewPane;
		view.loadSession(chatEditorInput.sessionId);
	} else {
		const chatService = accessor.get(IChatService);
		const providerId = chatService.getProviderInfos()[0].id;
		const viewId = chatContribService.getViewIdForProvider(providerId);
		await viewsService.openView(viewId);
	}
}

export function registerMoveActions() {
	registerAction2(class GlobalMoveToEditorAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInEditor`,
				title: {
					value: localize('interactiveSession.openInEditor.label', "Open Session In Editor"),
					original: 'Open Session In Editor'
				},
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			executeMoveToAction(accessor, MoveToNewLocation.Editor);
		}
	});

	registerAction2(class GlobalMoveToNewWindowAction extends Action2 {

		constructor() {
			super({
				id: `workbench.action.chat.openInNewWindow`,
				title: {
					value: localize('chat.openInNewWindow.label', "Open Session In New Window"),
					original: 'Open Session In New Window'
				},
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			executeMoveToAction(accessor, MoveToNewLocation.Window);
		}
	});

	registerAction2(class GlobalMoveToSidebarAction extends Action2 {
		constructor() {
			super({
				id: `workbench.action.chat.openInSidebar`,
				title: {
					value: localize('interactiveSession.openInSidebar.label', "Open Session In Sidebar"),
					original: 'Open Session In Sidebar'
				},
				category: CHAT_CATEGORY,
				precondition: CONTEXT_PROVIDER_EXISTS,
				f1: true,
				menu: [{
					id: MenuId.EditorTitle,
					order: 0,
					when: ActiveEditorContext.isEqualTo(ChatEditorInput.EditorID),
				}]
			});
		}

		async run(accessor: ServicesAccessor, ...args: any[]) {
			return moveToSidebar(accessor);
		}
	});
}

enum MoveToNewLocation {
	Editor,
	Window
}

async function executeMoveToAction(accessor: ServicesAccessor, moveTo: MoveToNewLocation) {
	const widgetService = accessor.get(IChatWidgetService);
	const viewService = accessor.get(IViewsService);
	const chatService = accessor.get(IChatService);
	const editorService = accessor.get(IEditorService);
	const instantiationService = accessor.get(IInstantiationService);
	const editorGroupService = accessor.get(IEditorGroupsService);
	const auxiliaryEditorPart = await editorGroupService.createAuxiliaryEditorPart();

	const widget = widgetService.lastFocusedWidget;
	if (!widget || !('viewId' in widget.viewContext)) {
		const providerId = chatService.getProviderInfos()[0].id;
		if (moveTo === MoveToNewLocation.Editor) {
			await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { providerId }, pinned: true } });
		}
		if (moveTo === MoveToNewLocation.Window) {
			const chatEditorInput = instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), { target: { providerId } });
			auxiliaryEditorPart.activeGroup.openEditor(chatEditorInput, { pinned: true });
		}
		return;
	}

	const viewModel = widget.viewModel;
	if (!viewModel) {
		return;
	}

	const sessionId = viewModel.sessionId;
	const view = await viewService.openView(widget.viewContext.viewId) as ChatViewPane;
	view.clear();
	if (moveTo === MoveToNewLocation.Editor) {
		await editorService.openEditor({ resource: ChatEditorInput.getNewEditorUri(), options: <IChatEditorOptions>{ target: { sessionId: sessionId }, pinned: true } });
	}
	if (moveTo === MoveToNewLocation.Window) {
		const chatEditorInput = instantiationService.createInstance(ChatEditorInput, ChatEditorInput.getNewEditorUri(), { target: { sessionId } });
		await auxiliaryEditorPart.activeGroup.openEditor(chatEditorInput, { pinned: true });
	}
}
