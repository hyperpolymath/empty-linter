type match = {
  line: int,
  column: int,
  artifactType: string,
}

@val external readTextFile: string => promise<string> = "Deno.readTextFile"

let patterns = [
  (js"%re(/\u00A0/g)", "NBSP"),
  (js"%re(/\u200B/g)", "ZWSP"),
]

let auditFile = async (filePath) => {
  let content = await readTextFile(filePath)
  let lines = Js.String2.split(content, "\n")
  
  lines->Belt.Array.forEachWithIndex((lineText, lineIdx) => {
    patterns->Belt.Array.forEach(((regex, label)) => {
      let m = ref(Js.Re.exec_(regex, lineText))
      while m.contents->Belt.Option.isSome {
        let res = m.contents->Belt.Option.getExn
        let col = Js.Re.index(res) + 1
        Js.log(`[${label}] at L:${Belt.Int.toString(lineIdx + 1)} C:${Belt.Int.toString(col)}`)
        m := Js.Re.exec_(regex, lineText)
      }
    })
  })
}
