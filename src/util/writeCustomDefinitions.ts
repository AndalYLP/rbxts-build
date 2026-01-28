import assert from "assert";
import fs from "fs/promises";
import ts, { NodeArray } from "typescript";
import { CLIError } from "../errors/CLIError";
import { createParseConfigFileHost } from "./createParseConfigFileHost";

interface InterfaceProperties<members = Array<ts.TypeElement>> {
	modifiers?: NodeArray<ts.ModifierLike>;
	typeParameters?: NodeArray<ts.TypeParameterDeclaration>;
	heritageClauses?: NodeArray<ts.HeritageClause>;
	name?: string;
	members: members;
}

interface PropertySignatureProperties {
	modifiers?: NodeArray<ts.Modifier>;
	name?: string;
	questionToken?: ts.QuestionToken;
	type?: string | ts.TypeNode;
}

interface MethodSignatureProperties extends PropertySignatureProperties {
	typeParameters?: NodeArray<ts.TypeParameterDeclaration>;
	parameters: NodeArray<ts.ParameterDeclaration>;
}

export function writeCustomDefinitions(customDefinitionPath: string, outPath: string) {
	return new Promise<void>(async (resolve, reject) => {
		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
			"tsconfig.json",
			undefined,
			createParseConfigFileHost(),
		);
		assert(parsedCommandLine, "Failed to parse tsconfig.json");

		const compilerHost = ts.createCompilerHost(parsedCommandLine.options, true);
		const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options, compilerHost);

		const customDefinitionSourceFile = program.getSourceFile(customDefinitionPath);
		const outSourceFile = program.getSourceFile(outPath);
		if (!customDefinitionSourceFile || !outSourceFile) {
			reject("Source files not found.");
			return;
		}

		const overrideInterfaceMap = new Map<string, ts.InterfaceDeclaration>();
		for (const statement of customDefinitionSourceFile.statements) {
			if (ts.isInterfaceDeclaration(statement)) {
				overrideInterfaceMap.set(statement.name.text, statement);
			}
		}

		const out: Array<ts.Statement> = [];
		const moduleBlock: Array<ts.Statement> = [];

		for (const statement of outSourceFile.statements) {
			if (!ts.isInterfaceDeclaration(statement)) {
				moduleBlock.push(statement);
				continue;
			}

			const interfaceName = statement.name.text;
			const overrideData = extractInterfaceProperties(overrideInterfaceMap.get(interfaceName));

			const members = getOverridedTypeElements(statement.members, overrideData?.members);

			moduleBlock.push(
				createInterfaceDeclaration({
					members,
					heritageClauses: overrideData?.heritageClauses ?? statement.heritageClauses,
					modifiers: overrideData?.modifiers ?? statement.modifiers,
					name: interfaceName,
					typeParameters: overrideData?.typeParameters ?? statement.typeParameters,
				}),
			);
		}

		out.push(
			ts.factory.createModuleDeclaration(
				[ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
				ts.factory.createIdentifier("global"),
				ts.factory.createModuleBlock(moduleBlock),
				ts.NodeFlags.GlobalAugmentation,
			),
		);

		const updatedSourceFile = ts.factory.createSourceFile(
			[...out, ts.factory.createExportDeclaration(undefined, false, ts.factory.createNamedExports([]))],
			ts.factory.createToken(ts.SyntaxKind.EndOfFileToken),
			ts.NodeFlags.None,
		);

		const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
		const output = printer.printFile(updatedSourceFile);

		await fs.writeFile(outPath, output);
		resolve();
	}).catch(err => {
		throw new CLIError(`write custom definitions exited with ${err}`);
	});
}

function handleNonPropertyOverrides(name: string, overrides: Array<ts.TypeElement>): Array<ts.TypeElement> {
	const result: Array<ts.TypeElement> = [];
	if (ts.isPropertySignature(overrides[0])) {
		if (overrides.length !== 1) {
			console.warn("More than one property with same name is not supported!");
		}

		const [override] = overrides;

		result.push(
			createPropertySignature({
				modifiers: override.modifiers,
				name,
				questionToken: override.questionToken,
				type: override.type?.getText(),
			}),
		);
	} else {
		for (const override of overrides) {
			if (ts.isMethodSignature(override)) {
				result.push(
					createMethodSignature({
						name,
						parameters: override.parameters,
						modifiers: override.modifiers,
						questionToken: override.questionToken,
						type: override.type?.getText(),
						typeParameters: override.typeParameters,
					}),
				);
			}
		}
	}

	return result;
}

function overridePropertyTypes(type: ts.TypeNode, override?: ts.TypeNode): [ts.TypeNode, boolean] {
	if (!override) {
		return [type, false];
	}

	if (ts.isIntersectionTypeNode(override) && !ts.isIntersectionTypeNode(type)) {
		return [override, false];
	}

	if (ts.isIntersectionTypeNode(type) && !ts.isIntersectionTypeNode(override)) {
		return [override, false];
	}

	if (ts.isIntersectionTypeNode(type) && ts.isIntersectionTypeNode(override)) {
		const filteredTypes = type.types.filter(value => !ts.isTypeReferenceNode(value));
		if (filteredTypes.length === 0) {
			return [override, false];
		}

		const filteredOverrideTypes = override.types.filter(value => !ts.isTypeReferenceNode(value));
		if (filteredOverrideTypes.length === 0) {
			return [override, false];
		}

		if (filteredOverrideTypes.length !== 1) {
			console.warn("More than one reference type is not supported!");
		}

		const [index] = filteredTypes;
		const [overrideIndex] = filteredOverrideTypes;

		const memberElements = index
			.getChildren()[1]
			.getChildren()
			.filter(value => ts.isTypeElement(value));

		const overrideMemberElements = getTypeElementsByName(
			overrideIndex
				.getChildren()[1]
				.getChildren()
				.filter(value => ts.isTypeElement(value)),
		);

		const result = getOverridedTypeElements(memberElements, overrideMemberElements);

		const typeLiteralNode = ts.factory.createTypeLiteralNode(result);
		return [
			ts.factory.createIntersectionTypeNode([
				typeLiteralNode,
				...type.types.filter(value => ts.isTypeReferenceNode(value)),
			]),
			true,
		];
	}

	return [override, false];
}

function getOverridedTypeElements(
	memberElements: Array<ts.TypeElement> | NodeArray<ts.TypeElement>,
	overrideMemberElements: Map<string, Array<ts.TypeElement>> = new Map(),
): Array<ts.TypeElement> {
	const result: Array<ts.TypeElement> = [];
	for (const member of memberElements) {
		const memberName = member.name?.getText();
		if (!memberName) continue;

		const overrides = overrideMemberElements.get(memberName);

		if (ts.isMethodSignature(member)) {
			if (overrides) {
				result.push(...handleNonPropertyOverrides(memberName, overrides));
				overrideMemberElements.delete(memberName);
			} else {
				result.push(
					createMethodSignature({
						modifiers: member.modifiers,
						name: memberName,
						questionToken: member.questionToken,
						parameters: member.parameters,
						typeParameters: member.typeParameters,
						type: member.type?.getText(),
					}),
				);
			}
		} else if (ts.isPropertySignature(member)) {
			if (overrides) {
				if (ts.isMethodSignature(overrides[0])) {
					for (const override of overrides) {
						if (ts.isMethodSignature(override)) {
							result.push(
								createMethodSignature({
									name: memberName,
									parameters: override.parameters,
									modifiers: override.modifiers,
									questionToken: override.questionToken,
									type: override.type?.getText(),
									typeParameters: override.typeParameters,
								}),
							);
						}
					}
				} else if (ts.isPropertySignature(overrides[0])) {
					if (overrides.length !== 1) {
						console.warn("More than one property with same name is not supported!");
					}
					const [override] = overrides;

					if (!member.type) {
						result.push(
							createPropertySignature({
								modifiers: member.modifiers,
								name: memberName,
								questionToken: override.questionToken,
								type: override.type?.getText(),
							}),
						);
						continue;
					}

					const [overrideType, isModified] = overridePropertyTypes(member.type, override.type);

					result.push(
						createPropertySignature({
							modifiers: member.modifiers,
							name: memberName,
							questionToken: override.questionToken,
							type: isModified ? overrideType : overrideType.getText(),
						}),
					);
				}

				overrideMemberElements.delete(memberName);
			} else {
				result.push(
					createPropertySignature({
						modifiers: member.modifiers,
						name: memberName,
						questionToken: member.questionToken,
						type: member.type?.getText(),
					}),
				);
			}
		}
	}

	for (const [name, overrides] of overrideMemberElements) {
		result.push(...handleNonPropertyOverrides(name, overrides));
	}

	return result;
}

function getTypeElementsByName(
	typeElements: Array<ts.TypeElement> | NodeArray<ts.TypeElement>,
): Map<string, Array<ts.TypeElement>> {
	const members = new Map<string, Array<ts.TypeElement>>();

	for (const member of typeElements) {
		const name = member.name?.getText();
		if (!name) continue;

		const arr = members.get(name);
		if (arr) arr.push(member);
		else members.set(name, [member]);
	}

	return members;
}

function extractInterfaceProperties(
	interfaceDeclaration: ts.InterfaceDeclaration | undefined,
): InterfaceProperties<Map<string, Array<ts.TypeElement>>> | undefined {
	if (!interfaceDeclaration) return undefined;

	return {
		typeParameters: interfaceDeclaration.typeParameters,
		heritageClauses: interfaceDeclaration.heritageClauses,
		members: getTypeElementsByName(interfaceDeclaration.members),
	};
}

function createPropertySignature({
	modifiers,
	questionToken,
	type,
	name = "unknown",
}: PropertySignatureProperties): ts.PropertySignature {
	return ts.factory.createPropertySignature(
		modifiers,
		name,
		questionToken,
		typeof type === "string" ? ts.factory.createTypeReferenceNode(type) : type,
	);
}

function createMethodSignature({
	modifiers,
	parameters,
	questionToken,
	type,
	typeParameters,
	name = "unknown",
}: MethodSignatureProperties): ts.MethodSignature {
	return ts.factory.createMethodSignature(
		modifiers,
		name,
		questionToken,
		typeParameters?.map(value => ts.factory.createTypeParameterDeclaration(undefined, value.getText())),
		parameters?.map(value =>
			ts.factory.createParameterDeclaration(
				value.modifiers,
				value.dotDotDotToken,
				value.name.getText(),
				value.questionToken,
				ts.factory.createTypeReferenceNode(value.type!.getText()),
				value.initializer,
			),
		),
		typeof type === "string" ? ts.factory.createTypeReferenceNode(type) : type,
	);
}

function createInterfaceDeclaration({
	members,
	heritageClauses,
	modifiers,
	typeParameters,
	name,
}: InterfaceProperties): ts.InterfaceDeclaration {
	return ts.factory.createInterfaceDeclaration(
		modifiers,
		name ?? "unknown",
		typeParameters?.map(value => ts.factory.createTypeParameterDeclaration(undefined, value.getText())),
		heritageClauses?.map(value =>
			ts.factory.createHeritageClause(
				value.token,
				value.types.map(value =>
					ts.factory.createExpressionWithTypeArguments(
						value.expression,
						value.typeArguments?.map(value => ts.factory.createTypeReferenceNode(value.getText())),
					),
				),
			),
		),
		members,
	);
}
