from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatGoogleGenerativeAI(
    model="gemini-3.1-flash-lite",
    temperature=0,
    timeout=20,
    max_retries=2,
    max_output_tokens=100,
)

prompt = ChatPromptTemplate.from_template("""
You are an insurance search query optimizer.

Rewrite the user's question into a single, self-contained, detailed search query.

- Resolve pronouns/references from chat history ("that", "it", "the same one") into explicit terms.
- Expand abbreviations, medical terms, and insurance terminology.
- If the question is already clear and self-contained, keep it close to the original.

Examples:

Chat History:
(none)

Question:
Does my policy cover ACL surgery?

Rewritten Query:
Does the health insurance policy cover anterior cruciate ligament (ACL) reconstruction surgery, knee ligament surgery, orthopedic surgery, sports injury treatment, hospitalization expenses and surgical treatment?

Chat History:
User: What is the waiting period for cataract surgery?
Assistant: Cataract surgery has a waiting period of 24 months from the policy start date.

Question:
What about knee replacement?

Rewritten Query:
What is the waiting period for knee replacement surgery under the health insurance policy?

Chat History:
{history}

Question:
{question}

Rewritten Query:
""")

query_rewriter = (
    prompt
    | llm
    | StrOutputParser()
)


def rewrite_query(question: str, history: list[str] | None = None) -> str:
    rewritten = query_rewriter.invoke({
        "question": question,
        "history": "\n".join(history) if history else "(none)",
    })

    # Guard against a runaway/garbled rewrite -- fall back to the original.
    if not rewritten.strip() or len(rewritten) > 300:
        return question

    return rewritten
