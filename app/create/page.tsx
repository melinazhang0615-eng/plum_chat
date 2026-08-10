import Link from "next/link";
import { Brand } from "@/components/brand";

export default function CreateCharacterPage() {
  return <main className="create-placeholder"><header><Brand /><Link href="/">返回首页</Link></header><section><span>CHARACTER CREATION</span><h1>创建你的角色</h1><p>角色创建流程和字段将在下一轮需求讨论后填充。</p><Link href="/">返回角色列表</Link></section></main>;
}
