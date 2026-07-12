# First-Class Component Deletion Design

## Goal

Make removal edits reliable in the demo. When a user highlights an editable UI component and asks to remove it, the resulting generated app must remove that component from the DOM, remain executable, and replace the visible working version only after the edited version passes validation.

## Scope

This work adds an explicit component-deletion patch operation, safe application rules, one automatic repair attempt for JavaScript that still references deleted DOM, and focused automated coverage.

General-purpose patch retries, arbitrary JavaScript rewriting, undo history, and deletion of non-component DOM nodes are out of scope. No new production dependency is required.

## Patch Contract

The edit response format will accept a fourth block label:

    ```delete:ComponentName
    ```

The block identifies the existing `data-component="ComponentName"` element to remove. It carries no replacement markup because deletion is the complete operation.

The existing `html`, `css`, and `js` replacement blocks remain unchanged. The edit-system prompt will instruct the model to use a `delete` block when the user explicitly requests removal, rather than returning hidden markup, an empty wrapper, or CSS such as `display: none`.

Patch parsing will produce deletion names separately from replacement regions. It will reject duplicate deletion names, a deletion and HTML replacement for the same component, deletion of the app root, and patch sets that operate on both an ancestor and one of its descendants.

## Applying a Deletion

Before mutating the document, the patch engine will resolve and validate every referenced component. For each accepted deletion, it will collect the deleted element's own component name and the names of all nested `data-component` elements, then:

1. Remove the selected outer element from the DOM.
2. Remove `style[data-style-region]` and `script[data-behavior-region]` elements whose region names correspond to any component removed with that subtree.
3. Preserve the global `style[data-style-region="app"]` and `script[data-behavior-region="app"]` regions.
4. Apply any compatible HTML, CSS, and JavaScript replacement blocks from the same response.
5. Run the existing generated-document validation against the complete result.

The root element marked with `data-app-root` cannot be deleted. A request to remove the whole application will fail patch validation and leave the working version unchanged.

## Runtime Repair

Removing component-scoped behavior regions does not guarantee that the global `app` behavior region has no references to the deleted DOM. The edited document will therefore continue through the existing off-screen staging iframe, which executes its behavior scripts and reports synchronous runtime errors.

If the first staging pass fails after a deletion, the edit flow will make one repair request. That request receives:

- the already-deleted candidate document;
- the original user instruction;
- the staging error, such as `Cannot set properties of null`;
- an explicit instruction not to restore the deleted component and to return only the smallest patches needed to make the candidate executable.

The repair response is parsed and applied through the same patch boundary, then staged again. A successful second staging pass becomes the new working version. If parsing, patching, validation, or the second staging pass fails, the operation stops and the previous working version remains visible.

Only deletion edits receive this automatic repair attempt. This keeps the demo behavior predictable and avoids introducing a general autonomous retry loop.

## User Experience and Error Handling

The current optimistic boundary remains: the existing demo stays in place while the candidate is patched, repaired if necessary, and staged. The user sees the edited version only after it passes.

A successful deletion uses the normal edit-success message. A failed deletion uses the existing preserved-version error state, with wording that makes clear the requested removal could not be applied safely. Runtime details remain available in development logging for diagnosis but are not exposed as raw errors in the main interface.

## Testing

Parser and patch-engine tests will cover:

- parsing an empty `delete:ComponentName` block;
- deleting a leaf component from the DOM;
- deleting a component subtree;
- removing component-scoped style and behavior regions for the entire deleted subtree;
- preserving global `app` style and behavior regions;
- rejecting a missing component, duplicate deletion, root deletion, delete-and-replace conflicts, and ancestor/descendant conflicts;
- validating the final generated document after deletion.

Edit-flow tests will cover:

- publishing a deletion that passes staging immediately;
- making exactly one repair request when deleted DOM leaves stale global JavaScript;
- publishing the repaired candidate after the second staging pass succeeds;
- retaining the previous working version when repair parsing, patching, or staging fails;
- never retrying more than once.

The full `bun test` suite and `bun run build` must pass.

## Acceptance Criteria

- An explicit removal instruction produces a deletion patch rather than hidden or empty replacement UI.
- The highlighted component is absent from the resulting DOM.
- Deleting a parent also removes behavior and style regions owned by components in that deleted subtree.
- The app root and global style/behavior regions cannot be deleted through a component deletion.
- Stale global JavaScript receives one automatic repair attempt without restoring the removed UI.
- A candidate with unresolved runtime errors never replaces the working demo.
- Successful deletion edits behave like normal edits and preserve the existing save and project-snapshot flow.
- Automated tests and the production build pass without adding a production dependency.
