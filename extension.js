const vscode = require("vscode");

function csvToSwift(csv) {
	csv = new CsvParser(csv);

	return new SwiftDecodable("CsvDecodable", csv).toSwiftCode() + "\n";
}

function activate(context) {
	let disposable = vscode.commands.registerCommand("swift-csv-decode.convertToSwiftDecodable", () => {

		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const content = editor.document.getText();
			try {
				vscode.workspace.openTextDocument(
					{ content: csvToSwift(content), language: "swift" }
				).then(
					doc => vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Two })
				);
			} catch (error) {
				vscode.window.showErrorMessage("Error converting CSV to Swift Decodable: " + error.message);
			}
		}
	});

	context.subscriptions.push(disposable);
}

module.exports = {
	activate
}

class CsvParser {
	constructor(csv) {
		let state = 0;
		let table = [];
		let row = [];
		let field = "";
		for(let char of csv) {
			if(state === 0) {
				if(char === ",") {
					row.push(field);
					field = "";
				}else if(char === "\n"){
					row.push(field);
					field = "";
					table.push(row);
					row = [];
				}else if(char === "\""){
					state = 1;
				}else {
					state = 3;
					field += char;
				}
			}else if(state === 1) {
				if(char === "\"") {
					state = 2;
				}else{
					field += char;
				}
			}else if(state === 2) {
				if(char === "\"") {
					state = 1;
					field += char;
				}else if(char === ",") {
					row.push(field);
					field = "";
					state = 0;
				}else if(char === "\n") {
					row.push(field);
					field = "";
					table.push(row);
					row = [];
					state = 0;
				}
			}else if(state === 3) {
				if(field === "\"") {
					throw Error("quotes in unquoted field");
				}else if(char === ",") {
					row.push(field);
					field = "";
					state = 0;
				}else if(char === "\n") {
					row.push(field);
					field = "";
					table.push(row);
					row = [];
					state = 0;
				}else {
					field += char;
				}
			}
		}

		if(field.length > 0) {
			row.push(field);
		}
		if(row.length > 0) {
			table.push(row);
		}

		let rowSizes = table.map(row => row.length);

		if(!rowSizes.every((size, i, arr) => size === arr[0])) {
			throw Error("invalid field count" + JSON.stringify(rowSizes));
		}

		if(table.length < 2) {
			throw Error("not enough rows");
		}

		let rowSize = rowSizes[0];

		this.columns = [];
		for(let i = 0;i<rowSize;i++){
			let column = [];
			for(let row of table) {
				column.push(row[i]);
			}
			this.columns.push(column);
		}
	}

	getColumnTypes() {
		const INT_REGEX = /^[-+]?[0-9]+$/;
		const FLOAT_REGEX = /^[-+]?(([0-9]+\.?)|([0-9]+\.[0-9]+)|(\.?[0-9]+))([eE][-+]?[0-9]+)?$/;

		let types = [];
		for(let column of this.columns) {
			let isOptinal = false;
			let type = "";
			for(let i=1;i<column.length;i++) {
				let value = column[i].trim().toLowerCase();
				if(value === "nan") {
					if(type === ""){
						type = "Float";
					}else if(type === "Bool"){
						type = "String"
					}else if(type === "Int") {
						type = "Float"
					}
				}else if(value === "true" || value === "false"){
					if(type === ""){
						type = "Bool";
					}else if(!type === "Bool") {
						type = "String"
					}
				}else if(value === ""){
					isOptinal = true;
				}else if(value === "null"){
					isOptinal = true;
				}else if(INT_REGEX.test(value)){
					if(type === ""){
						type = "Int";
					}else if(type === "Bool"){
						type = "String"
					}
				}else if(FLOAT_REGEX.test(value)){
					if(type === ""){
						type = "Float";
					}else if(type === "Bool"){
						type = "String"
					}
				}else{
					type = "String"
				}
			}

			if(isOptinal) {
				type += "?";
			}

			types.push(type);
		}
		return types;
	}

	getHeaders() {
		return this.columns.map(column => column[0]);
	}
}

class SwiftDecodable {
	constructor(name, csv) {
		this.name = name
		this.properties = csv.getHeaders();
		this.identifiers = this.properties.map(prop => this.asIdentifier(prop))

		this.types = csv.getColumnTypes();
	}

	asIdentifier(property) {
		return property.replace(/^[^\w]+/, "")
		.replace(/^[^\w]+/, "")
		.replace(/\s+(.)/g, (_, group) => group.toUpperCase())
		.replace(/\s/g, "")
		.replace(/^(.)/, (_, group) => group.toLowerCase());
	}

	toSwiftCode() {
		if (this.properties.length === 0) {
			return `struct ${this.name}: Decodable {}`
		} else {
			let innerProperties = "\n";
			let codingKeys = "\n    enum CodingKeys: String {\n";

			for(let i=0;i<this.properties.length;i++) {
				innerProperties += `    let ${this.identifiers[i]}: ${this.types[i]}` + "\n";
				
				if(this.identifiers[i] == this.properties[i]){
					codingKeys += `        case ${this.identifiers[i]}` + "\n";
				}else{
					codingKeys += `        case ${this.identifiers[i]} = "${this.properties[i]}"` + "\n";
				}
			}

			codingKeys += "    }\n";

			if(!codingKeys.includes("=")) {
				codingKeys = "";
			}

			return `struct ${this.name}: Decodable {${innerProperties}${codingKeys}}`;
		}
	}
}
