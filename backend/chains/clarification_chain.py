from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0
)

prompt = ChatPromptTemplate.from_template("""
You are an insurance assistant.

Determine if the question is ambiguous.

Return JSON only.

Examples:

Question:
What is my premium?

Output:
{{
  "needs_clarification": true,
  "clarification_question":
  "Which policy premium would you like to know? Health or Life?"
}}

Question:
What is the premium of my life insurance?

Output:
{{
  "needs_clarification": false,
  "clarification_question": ""
}}

Question:
{question}
""")

clarification_chain = (
    prompt
    | llm
    | JsonOutputParser()
)