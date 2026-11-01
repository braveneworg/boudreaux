/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Repo-local lint rules, loaded by oxlint through `jsPlugins` in
 * `.oxlintrc.json` (ESLint-compatible plugin API). Exercised by
 * `lint/boudreaux-plugin.spec.ts`.
 */

/** Return-type spellings TypeScript infers for a component on its own. */
const REACT_ELEMENT_TYPES = new Set([
  'ReactElement',
  'React.ReactElement',
  'ReactElement[]',
  'React.ReactElement[]',
  'JSX.Element',
  'React.JSX.Element',
  'ReactNode',
  'React.ReactNode',
  'ReactNode[]',
  'React.ReactNode[]',
]);

const NULLISH_MEMBERS = new Set(['null', 'undefined']);

/** Components are PascalCase; hooks, utilities and HOCs are not. */
const isComponentName = (name) => /^[A-Z][A-Za-z0-9]*$/.test(name);

/** `Promise<X>` → `X`, for async server components. */
const unwrapPromise = (type) =>
  type.startsWith('Promise<') && type.endsWith('>') ? type.slice('Promise<'.length, -1) : type;

/**
 * True when every union member is a React element type or `null`/`undefined`,
 * and at least one member is a React element type.
 */
const isInferableReactType = (annotationText) => {
  const members = unwrapPromise(annotationText.replace(/\s+/g, '')).split('|');
  const elementMembers = members.filter((member) => REACT_ELEMENT_TYPES.has(member));
  const rest = members.filter((member) => !REACT_ELEMENT_TYPES.has(member));
  return elementMembers.length > 0 && rest.every((member) => NULLISH_MEMBERS.has(member));
};

const noComponentReturnType = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow return-type annotations on React components when TypeScript infers the same type.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      inferable:
        '`{{name}}` is a component: TypeScript infers `{{type}}` from its body, so the annotation is noise. Remove it.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    const check = (fn, name) => {
      if (!fn.returnType || !isComponentName(name)) {
        return;
      }
      const type = sourceCode.getText(fn.returnType.typeAnnotation);
      if (!isInferableReactType(type)) {
        return;
      }
      context.report({
        node: fn.returnType,
        messageId: 'inferable',
        data: { name, type: type.replace(/\s+/g, ' ') },
        fix: (fixer) => fixer.remove(fn.returnType),
      });
    };

    return {
      FunctionDeclaration(node) {
        if (node.id) {
          check(node, node.id.name);
        }
      },
      VariableDeclarator(node) {
        const { id, init } = node;
        if (
          id.type === 'Identifier' &&
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
        ) {
          check(init, id.name);
        }
      },
    };
  },
};

const plugin = {
  meta: { name: 'boudreaux' },
  rules: {
    'no-component-return-type': noComponentReturnType,
  },
};

export default plugin;
