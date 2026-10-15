// Danh sách dữ liệu ngẫu nhiên người bình chọn Việt Nam & Lời chúc
const VIETNAMESE_LAST_NAMES = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng',
  'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Đoàn', 'Mai', 'Trịnh',
  'Đào', 'Cao', 'Hà', 'Lưu', 'Lương', 'Thái', 'Châu', 'Tạ', 'Phùng', 'Tô',
  'Lâm', 'Trương', 'Diệp'
];

const VIETNAMESE_MALE_MIDDLE = [
  'Văn', 'Minh', 'Tuấn', 'Đức', 'Hoàng', 'Quốc', 'Đình', 'Thanh', 'Hữu', 'Thành',
  'Duy', 'Quang', 'Tiến', 'Trọng', 'Bảo', 'Gia', 'Anh', 'Ngọc', 'Phúc', 'Công',
  'Khắc', 'Trí'
];

const VIETNAMESE_MALE_FIRST = [
  'Hùng', 'Dũng', 'Tuấn', 'Nam', 'Long', 'Cường', 'Hải', 'Kiệt', 'Huy', 'Thắng',
  'Đạt', 'Sơn', 'Khoa', 'Phúc', 'Nghĩa', 'Trọng', 'Bách', 'Quân', 'Lâm', 'Toàn',
  'Thịnh', 'Phát', 'Triết', 'Phong', 'Khang', 'Nhân', 'Việt', 'Triều', 'Bảo', 'Tú',
  'Đăng', 'Khôi', 'Nguyên', 'Hưng', 'Kiên'
];

const VIETNAMESE_FEMALE_MIDDLE = [
  'Thị', 'Ngọc', 'Thùy', 'Phương', 'Diệu', 'Quỳnh', 'Kim', 'Thanh', 'Mỹ', 'Khánh',
  'Bích', 'Thu', 'Bảo', 'Hồng', 'Ánh', 'Tuyết', 'Mai', 'Trúc', 'Yến', 'Hoài',
  'Cẩm', 'Tường'
];

const VIETNAMESE_FEMALE_FIRST = [
  'Linh', 'Trang', 'Nga', 'Anh', 'Thảo', 'Hương', 'Uyên', 'Quỳnh', 'Nhi', 'Ngân',
  'Hằng', 'Huyền', 'Vy', 'Dung', 'Chi', 'Mai', 'Trâm', 'Phương', 'Trúc', 'Hà',
  'Lan', 'My', 'Vân', 'Tâm', 'Nhung', 'Diệp', 'Thư', 'Châu', 'Giang', 'Yến',
  'Trinh', 'Đan', 'Ly', 'Quyên', 'Tú'
];

const VIETNAMESE_COMMENTS = [
  'Chúc bạn luôn tự tin, tỏa sáng và giành vương miện nhé!',
  'Ủng hộ bạn hết mình! Chúc bạn đạt giải cao nhất!',
  'Nụ cười rất sáng và duyên dáng, xứng đáng hoa khôi năm nay!',
  'Cố lên bạn ơi, cả khoa luôn theo dõi và cổ vũ bạn!',
  '1 vote cho nhan sắc và tài năng xuất sắc này!',
  'Thần thái quá đỉnh, mãi đỉnh luôn nha bạn ơi!',
  'Chúc bạn luôn tự tin và hoàn thành thật xuất sắc các phần thi!',
  'Ủng hộ bạn thân của mình, bạn luôn là số 1 trong lòng mọi người!',
  'Nét đẹp tri thức và dịu dàng, vote nhiệt tình luôn nè!',
  'Chúc bạn tỏa sáng rực rỡ trên sân khấu chung kết nhé!',
  'Tự tin chiến thắng nhé, mọi người luôn ủng hộ bạn!',
  'Gương mặt sáng sân khấu và phong thái rất tự tin! 10 điểm!',
  'Vote cho cô gái tài năng và xinh đẹp nhất cuộc thi!',
  'Chúc bạn đạt kết quả thật cao và mang tự hào về cho khoa nhé!',
  'Xinh xắn, tài năng và rất thân thiện. Vote cho bạn!',
  'Cố lên nhé người đẹp ơi, chúc bạn đăng quang xứng đáng!',
  'Quá xuất sắc luôn bạn ơi, luôn ủng hộ bạn hết mình!',
  'Thần thái tự tin ngút ngàn, một phiếu ủng hộ cho bạn!',
  'Chúc bạn có những trải nghiệm thật đáng nhớ và đạt ngôi vị cao nhất!',
  'Luôn theo dõi và cổ vũ bạn từ vòng đầu, cố lên nhé!',
  'Nhan sắc cực phẩm cùng nụ cười tỏa nắng, chúc bạn chiến thắng!',
  'Ủng hộ đại diện khoa mình, quá tự hào luôn!',
  'Chúc bạn bình tĩnh, tự tin và tỏa sáng đúng phong độ nha!',
  'Rất ấn tượng với phần thể hiện của bạn, chúc bạn thành công!',
  'Một phiếu bình chọn cho sự nỗ lực và tài năng của bạn!',
  'Quá duyên dáng và thanh lịch, chúc bạn lọt top cao nhất!',
  'Chúc bạn luôn giữ vững nụ cười rạng rỡ và tự tin trên sân khấu!',
  'Mọi người ở lớp luôn bên cạnh và cổ vũ bạn, cố lên!',
  'Chúc bạn ghi dấu ấn thật đẹp và giành vương miện năm nay!',
  'Cổ vũ hết mình cho bạn, chúc bạn may mắn và thành công!',
  'Tỏa sáng rực rỡ nhé! Cả trường luôn tự hào về bạn!',
  'Một vẻ đẹp vừa hiện đại vừa duyên dáng, xứng đáng hoa khôi!',
  'Chúc bạn cháy hết mình trên sân khấu và gặt hái thành công!',
  'Vote 1 phiếu thật chất lượng cho bạn, tự tin lên nha!',
  'Nụ cười đốn tim người nhìn, chúc bạn đạt giải cao nhất!',
  'Cố lên bạn ơi, chiến thắng đang chờ đón bạn phía trước!',
  'Quá xinh đẹp và thanh tú! Luôn cổ vũ bạn hết mình!',
  'Một phiếu cho tài sắc vẹn toàn, chúc bạn may mắn!',
  'Ủng hộ bạn 100%, phong thái rất đỉnh và thu hút!',
  'Chúc bạn đạt được kết quả xứng đáng với sự nỗ lực của mình!',
  'Nhan sắc ngọt ngào quá, vote liền tay không cần nghĩ!',
  'Tự tin là chính mình và tỏa sáng nha bạn ơi!',
  'Ủng hộ bạn hết nấc luôn, chúc bạn ẵm giải đặc biệt!',
  'Duyên dáng, thông minh và bản lĩnh. Xứng đáng vào top 1!',
  'Thần thái sang trọng và cuốn hút, vote nhiệt liệt luôn!',
  'Chúc bạn có đêm thi thật bùng nổ và thành công rực rỡ!',
  'Cố lên nhé đồng hương ơi, mọi người luôn dõi theo bạn!',
  'Nụ cười tỏa nắng và rất thân thiện, 10 điểm tuyệt đối!',
  'Chúc bạn luôn tự tin vững bước, thành công sẽ đến với bạn!',
  'Đại diện xuất sắc nhất khoa, vote mạnh tay luôn!',
  'Chúc bạn đạt vương miện, bạn xứng đáng với vị trí này nhất!',
  'Bình chọn cho bạn vì sự tự tin và tài năng vượt trội!',
  '10 điểm cho sự dịu dàng và nét đẹp truyền thống!',
  'Luôn ủng hộ và tin tưởng bạn sẽ chiến thắng!',
  'Chúc bạn luôn rạng ngời và giữ vững phong độ đỉnh cao!'
];

const FACULTIES = [
  'Khoa Xây dựng',
  'Khoa Kiến trúc',
  'Khoa Kinh tế & QTKD',
  'Khoa Công nghệ thông tin',
  'Khoa Kỹ thuật Hạ tầng',
  'Khoa Cầu đường',
  'Khoa Cơ khí'
];

const CLASS_PREFIXES = ['D21', 'D22', 'D23', 'D24'];

const CLASS_SUFFIXES = {
  'Khoa Xây dựng': ['XD01', 'XD02', 'XD03'],
  'Khoa Kiến trúc': ['KTR01', 'KTR02'],
  'Khoa Kinh tế & QTKD': ['KT01', 'KT02', 'QT01', 'QT02'],
  'Khoa Công nghệ thông tin': ['CNTT1', 'CNTT2', 'CNTT3'],
  'Khoa Kỹ thuật Hạ tầng': ['HT01', 'HT02'],
  'Khoa Cầu đường': ['CD01', 'CD02'],
  'Khoa Cơ khí': ['CK01', 'CK02']
};

function getRandomVietnameseName() {
  const isFemale = Math.random() < 0.55;
  const lastName = VIETNAMESE_LAST_NAMES[Math.floor(Math.random() * VIETNAMESE_LAST_NAMES.length)];
  if (isFemale) {
    const middle = VIETNAMESE_FEMALE_MIDDLE[Math.floor(Math.random() * VIETNAMESE_FEMALE_MIDDLE.length)];
    const first = VIETNAMESE_FEMALE_FIRST[Math.floor(Math.random() * VIETNAMESE_FEMALE_FIRST.length)];
    return `${lastName} ${middle} ${first}`;
  } else {
    const middle = VIETNAMESE_MALE_MIDDLE[Math.floor(Math.random() * VIETNAMESE_MALE_MIDDLE.length)];
    const first = VIETNAMESE_MALE_FIRST[Math.floor(Math.random() * VIETNAMESE_MALE_FIRST.length)];
    return `${lastName} ${middle} ${first}`;
  }
}

function getRandomVietnameseComment() {
  return VIETNAMESE_COMMENTS[Math.floor(Math.random() * VIETNAMESE_COMMENTS.length)];
}

function getRandomVoterIp() {
  const ipPrefixes = ['14.232', '113.161', '171.244', '42.115', '27.72', '125.235', '116.108', '14.162', '118.69'];
  const ipPrefix = ipPrefixes[Math.floor(Math.random() * ipPrefixes.length)];
  return `${ipPrefix}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
}

module.exports = {
  getRandomVietnameseName,
  getRandomVietnameseComment,
  getRandomVoterIp,
  VIETNAMESE_LAST_NAMES,
  VIETNAMESE_COMMENTS
};
