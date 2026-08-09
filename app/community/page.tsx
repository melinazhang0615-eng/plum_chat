import Link from "next/link";
import { Brand } from "@/components/brand";

export default function CommunityPage() {
  return <main className="community-placeholder">
    <header><Brand /><Link href="/">返回首页</Link></header>
    <section>
      <span>PLUM COMMUNITY</span>
      <h1>加入 Plum 社区</h1>
      <p>在这里认识同好、分享角色和故事。Discord 社区入口将在正式链接确认后开放。</p>
      <button disabled>Discord · 即将开放</button>
      <Link href="/">继续发现角色</Link>
    </section>
  </main>;
}
