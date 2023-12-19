export function inputsToTypes(inputs: any) {
  return inputs.map((input: any) => {
    if (input.type.startsWith('tuple')) {
      const tupleTypes = inputsToTypes(input.components)
      const isArray = input.type.endsWith('[]')
      return `(${tupleTypes.join(',')})${isArray ? '[]' : ''} ${input.name}`
    }
    return `${input.type} ${input.name}`
  })
}
