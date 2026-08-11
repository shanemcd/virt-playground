import { AnnotationHandler, InnerLine } from "codehike/code"
import { PreWithFocus } from "./focus.client"

export const focus: AnnotationHandler = {
  name: "focus",
  onlyIfAnnotated: true,
  PreWithRef: PreWithFocus,
  Line: (props) => (
    <InnerLine merge={props} className="kv-code-line" />
  ),
  AnnotatedLine: ({ annotation, ...props }) => (
    <InnerLine merge={props} data-focus={true} className="kv-code-line-focus" />
  ),
}
