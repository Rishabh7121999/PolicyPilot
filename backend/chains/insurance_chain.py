from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash-lite",
    temperature=0
)

prompt = ChatPromptTemplate.from_template("""
You are an expert insurance advisor.

Use ONLY the information present in the retrieved context to answer the user's question.

Rules for Answering:
1. Handle Ambiguity: If the user's question is broad (e.g., "what is my premium") and the context contains information for MULTIPLE policies (e.g., Health and Life), summarize the answer for BOTH policies, or politely ask them to clarify which policy they mean.
2. Deductive Reasoning for Waiting Periods: Insurance policies list EXCLUSIONS and WAITING PERIODS. If a user asks what is covered in the "first year," look at the specific waiting periods (like 24-months). Explain that conditions explicitly listed there are NOT covered in the first year, but other medically necessary surgeries are typically covered after the initial 30-day waiting period, subject to policy terms.
3. Handling Missing Terms: If an exact medical term (like "ACL") isn't in the text, do not just say you can't find it. Check if there are general rules for "ligament tears", "joint surgeries", or general waiting periods, and explain those instead.
4. If you truly have no relevant context to address the query or related concepts, say: "I could not find that specific information in the policy documents."
5. Keep answers concise, clear, and professional.
6. Prefer direct answers over long explanations.                                         

Chat History:
{history}

Retrieved Context:
{context}

User Question:
{question}

Answer:
""")
chain = (
    prompt
    | llm
    | StrOutputParser()
)